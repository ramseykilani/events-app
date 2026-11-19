import type { Api, JoinStatus } from './api';
import type { Cache } from './cache';
import { SETTINGS, isOn, withSetting } from './channelSettings';
import {
  attachmentPath,
  isRefusal,
  refusalMessage,
  retryDelayMs,
  toTimelineMessage,
  type OutboxEntry,
  type PendingUpload,
} from './outbox';
import { TYPING_VISIBLE_MS, type LiveConnection, type LiveFactory, type LiveStatus, type RoomPresence } from './realtime';
import {
  EMPTY_TIMELINE,
  applyToTimelines,
  cacheSlice,
  maxUpdatedAt,
  patchMessage,
  removeMessage,
  upsertMessages,
  type Timeline,
} from './timeline';
import type { Channel, Couple, Message, PartnerReads, Preset, SettingValue, TimelineMessage } from './types';

// ChatEngine: the client's single source of conversation state, outside
// React so it can be driven and pinned by Jest with a fake Api, cache and
// live factory (the same seam production uses — no test code ships).
//
// Smoothness rules it implements (FEATURES.md -> Messaging):
//   - Instant open: cached channels/messages render before any network.
//   - Optimistic send: a message is on screen the moment it is sent; the
//     outbox retries it (idempotent on its client id) until the server
//     confirms or refuses.
//   - Live: Realtime rows merge in as they happen; every (re)subscribe runs
//     the catch-up feed, so nothing is lost across a dropped socket.
//   - Never blank: a failed refresh keeps last-good state and raises a flag
//     the UI shows as a quiet retry line.

export type Phase = 'booting' | 'unpaired' | 'waiting' | 'paired' | 'error';

export type EngineState = {
  phase: Phase;
  couple: Couple | null;
  channels: Channel[];
  presets: Preset[];
  timelines: Record<string, Timeline>;
  partnerReads: PartnerReads;
  // channelId -> epoch ms until which the partner reads as typing
  typing: Record<string, number>;
  live: LiveStatus;
  partnerInRoom: boolean;
  meInRoom: boolean;
  refreshFailed: boolean;
};

export type Draft = {
  body: string;
  replyToId?: string | null;
  urgent?: boolean;
  upload?: PendingUpload & { kind: 'image' | 'voice' };
};

export type IncomingListener = (message: Message, channel: Channel | undefined) => void;

export type EngineDeps = {
  api: Api;
  cache: Cache;
  connectLive: LiveFactory;
  userId: string;
  uuid: () => string;
  // Reads a local file into something storage can upload.
  readFile: (uri: string) => Promise<Blob | ArrayBuffer>;
  now?: () => number;
};

const PAGE = 50;
const CATCH_UP_PAGE = 200;
// More missed changes than this and the cache is not worth patching: drop
// the cached timelines and load fresh pages instead.
const CATCH_UP_LIMIT = 2000;

function defaultsFor(scope: 'shared' | 'personal'): Record<string, SettingValue> {
  return Object.fromEntries(SETTINGS.filter((s) => s.scope === scope).map((s) => [s.key, s.default]));
}

function ts(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) || 0 : 0;
}

export class ChatEngine {
  private deps: EngineDeps;
  private listeners = new Set<() => void>();
  private incoming = new Set<IncomingListener>();
  private live: LiveConnection | null = null;
  private liveCoupleId: string | null = null;
  private outbox: OutboxEntry[] = [];
  private cursor: string | null = null;
  // True from a (re)subscribe until the catch-up feed has run: rows that
  // arrive meanwhile (live, own sends, a channel page) say nothing about
  // what was missed, so they must not move the cursor past it.
  private gapOpen = true;
  // Bumped by every local channel write and every live channel row. A
  // get_channels read that started before a bump may predate that change,
  // so its answer is read again instead of overwriting newer state.
  private channelEpoch = 0;
  private flushing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private channelRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private loadedFromCache = new Set<string>();
  private stopped = false;
  activeChannelId: string | null = null;

  state: EngineState = {
    phase: 'booting',
    couple: null,
    channels: [],
    presets: [],
    timelines: {},
    partnerReads: {},
    typing: {},
    live: 'connecting',
    partnerInRoom: false,
    meInRoom: false,
    refreshFailed: false,
  };

  constructor(deps: EngineDeps) {
    this.deps = deps;
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  // ----- subscription (useSyncExternalStore) -----
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): EngineState => this.state;

  onIncoming(listener: IncomingListener): () => void {
    this.incoming.add(listener);
    return () => this.incoming.delete(listener);
  }

  private set(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  // ----- lifecycle -----
  async start(): Promise<void> {
    const snap = await this.deps.cache.load();
    this.outbox = snap.outbox;
    this.cursor = snap.cursor;
    let timelines: Record<string, Timeline> = {};
    timelines = applyToTimelines(timelines, this.outbox.map(toTimelineMessage));
    this.set({
      couple: snap.couple,
      channels: snap.channels,
      partnerReads: snap.partnerReads,
      timelines,
      phase: snap.couple?.paired_at ? 'paired' : 'booting',
    });
    await this.refresh();
  }

  stop(): void {
    this.stopped = true;
    this.live?.stop();
    this.live = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.channelRefreshTimer) clearTimeout(this.channelRefreshTimer);
    for (const t of this.typingTimers.values()) clearTimeout(t);
  }

  // Where am I: unpaired, waiting for the partner, or paired. Paired loads
  // channels and goes live. A failure keeps whatever is on screen.
  async refresh(): Promise<void> {
    let couple: Couple | null;
    try {
      couple = await this.deps.api.getMyCouple();
    } catch (err) {
      console.error('couple load failed:', err);
      this.set({
        refreshFailed: true,
        phase: this.state.phase === 'booting' ? 'error' : this.state.phase,
      });
      return;
    }
    if (this.stopped) return;
    this.deps.cache.saveCouple(couple);

    if (!couple) {
      this.stopLive();
      this.set({ couple: null, phase: 'unpaired', channels: [], timelines: {}, refreshFailed: false });
      return;
    }
    if (!couple.paired_at) {
      this.set({ couple, phase: 'waiting', refreshFailed: false });
      this.ensureLive(couple.couple_id);
      return;
    }

    this.set({ couple, phase: 'paired' });
    this.ensureLive(couple.couple_id);
    await Promise.all([this.refreshChannels(), this.loadPresets(), this.refreshPartnerReads()]);
    await this.catchUp();
    void this.flushOutbox();
  }

  private ensureLive(coupleId: string): void {
    if (this.live && this.liveCoupleId === coupleId) return;
    this.stopLive();
    this.liveCoupleId = coupleId;
    this.live = this.deps.connectLive(coupleId, this.deps.userId, {
      onMessage: (row, inserted) => this.handleLiveMessage(row, inserted),
      onChannel: (row, deleted) => this.handleLiveChannel(row, deleted),
      onPrefs: () => this.scheduleChannelRefresh(),
      onMembers: () => void this.refresh(),
      onTyping: (channelId) => this.handleTyping(channelId),
      onRead: (channelId, _userId, at) => this.handlePartnerRead(channelId, at),
      onPresence: (members) => this.handlePresence(members),
      onStatus: (status) => {
        const was = this.state.live;
        if (status !== 'live') this.gapOpen = true;
        this.set({ live: status });
        // Every (re)subscribe re-reads what was missed.
        if (status === 'live' && was !== 'live' && this.state.phase === 'paired') {
          void this.catchUp();
          this.scheduleChannelRefresh();
          void this.flushOutbox();
        }
      },
    });
  }

  private stopLive(): void {
    this.live?.stop();
    this.live = null;
    this.liveCoupleId = null;
  }

  // ----- reads -----
  async refreshChannels(): Promise<void> {
    try {
      let channels: Channel[];
      for (let attempt = 0; ; attempt++) {
        const epoch = this.channelEpoch;
        channels = await this.deps.api.getChannels();
        if (epoch === this.channelEpoch || attempt >= 2) break;
      }
      this.set({ channels, refreshFailed: false });
      this.deps.cache.saveChannels(channels);
    } catch (err) {
      console.error('channels load failed:', err);
      this.set({ refreshFailed: true });
    }
  }

  private scheduleChannelRefresh(): void {
    if (this.channelRefreshTimer) clearTimeout(this.channelRefreshTimer);
    this.channelRefreshTimer = setTimeout(() => void this.refreshChannels(), 300);
  }

  private async loadPresets(): Promise<void> {
    if (this.state.presets.length > 0) return;
    try {
      this.set({ presets: await this.deps.api.getPresets() });
    } catch (err) {
      console.error('presets load failed:', err);
    }
  }

  private async refreshPartnerReads(): Promise<void> {
    try {
      const partnerReads = await this.deps.api.getPartnerReads();
      this.set({ partnerReads });
      this.deps.cache.saveReads(partnerReads);
    } catch (err) {
      console.error('partner reads load failed:', err);
    }
  }

  // Open a conversation: cached messages first (instant, offline-readable),
  // then the newest page from the server.
  async openChannel(channelId: string): Promise<void> {
    this.activeChannelId = channelId;
    if (!this.loadedFromCache.has(channelId)) {
      this.loadedFromCache.add(channelId);
      const cached = await this.deps.cache.loadMessages(channelId);
      if (cached.length > 0) this.mergeRows(cached, false);
    }
    try {
      const page = await this.deps.api.getMessages(channelId, undefined, PAGE);
      const tl = this.timeline(channelId);
      this.setTimeline(channelId, {
        ...tl,
        messages: upsertMessages(tl.messages, page),
        fresh: true,
        hasOlder: page.length === PAGE ? tl.hasOlder : tl.messages.length > page.length && tl.hasOlder,
      });
      // One channel's newest page says nothing about the others: it only
      // starts a cursor that does not exist yet.
      if (!this.cursor) this.advanceCursor(page);
      this.persistTimeline(channelId);
    } catch (err) {
      console.error('messages load failed:', err);
      throw err;
    }
  }

  closeChannel(channelId: string): void {
    if (this.activeChannelId === channelId) this.activeChannelId = null;
  }

  async loadOlder(channelId: string): Promise<void> {
    const tl = this.timeline(channelId);
    if (!tl.hasOlder) return;
    const oldest = tl.messages.find((m) => !m.local);
    const page = await this.deps.api.getMessages(
      channelId,
      oldest ? { created_at: oldest.created_at, id: oldest.id } : undefined,
      PAGE
    );
    const current = this.timeline(channelId);
    this.setTimeline(channelId, {
      ...current,
      messages: upsertMessages(current.messages, page),
      hasOlder: page.length === PAGE,
    });
  }

  // The "Open" view of a channel that tracks items: every open item, even
  // ones older than the loaded pages, merged into the timeline.
  async loadOpenItems(channelId: string): Promise<void> {
    const rows = await this.deps.api.getOpenItems(channelId);
    this.mergeRows(rows, false);
  }

  // The catch-up feed: every change in the couple since the cursor.
  async catchUp(): Promise<void> {
    const liveAtStart = this.state.live === 'live';
    if (!this.cursor) {
      if (liveAtStart) this.gapOpen = false;
      return;
    }
    let since = this.cursor;
    let fetched = 0;
    try {
      for (;;) {
        // Pages follow this feed's own position, not this.cursor, which
        // other paths may have moved meanwhile.
        const rows = await this.deps.api.getMessageChanges(since, CATCH_UP_PAGE);
        fetched += rows.length;
        if (fetched > CATCH_UP_LIMIT) {
          // Too far behind to patch: start the timelines over.
          this.loadedFromCache.clear();
          this.set({ timelines: applyToTimelines({}, this.outbox.map(toTimelineMessage)) });
          this.cursor = null;
          this.deps.cache.saveCursor(null);
          if (this.activeChannelId) await this.openChannel(this.activeChannelId);
          return;
        }
        if (rows.length > 0) {
          this.mergeRows(rows, false);
          since = maxUpdatedAt(rows, since) ?? since;
          this.advanceCursor(rows);
        }
        if (rows.length < CATCH_UP_PAGE) break;
      }
      // Everything up to the subscribe that started this read is in: live
      // rows may move the cursor again.
      if (liveAtStart && this.state.live === 'live') this.gapOpen = false;
    } catch (err) {
      console.error('catch-up failed:', err);
    }
  }

  // ----- live handlers -----
  private handleLiveMessage(row: Message, inserted: boolean): void {
    const known = Object.values(this.state.timelines).some((tl) => tl.messages.some((m) => m.id === row.id));
    this.mergeRows([row], !this.gapOpen);
    // Only a new row is a new message: an update to one this device has not
    // loaded (a reaction, done, edit or move of an old message) is not.
    if (inserted && !known && row.sender_id !== this.deps.userId && !row.deleted_at) {
      // A new partner message: they are not typing anymore.
      this.clearTyping(row.channel_id);
      const channel = this.state.channels.find((c) => c.id === row.channel_id);
      for (const l of this.incoming) l(row, channel);
    }
  }

  private handleLiveChannel(row: Partial<Channel> & { id: string }, deleted: boolean): void {
    this.channelEpoch++;
    if (deleted) {
      this.set({ channels: this.state.channels.filter((c) => c.id !== row.id) });
      return;
    }
    const existing = this.state.channels.find((c) => c.id === row.id);
    if (!existing) {
      // A channel the partner just made: the full row (with my prefs) comes
      // from get_channels.
      this.scheduleChannelRefresh();
      return;
    }
    const stored = (row.settings ?? {}) as Record<string, SettingValue>;
    const merged: Channel = {
      ...existing,
      name: row.name ?? existing.name,
      icon: row.icon ?? existing.icon,
      position: row.position ?? existing.position,
      archived_at: row.archived_at !== undefined ? row.archived_at : existing.archived_at,
      // Realtime carries the stored settings; fill registry defaults back in.
      settings: row.settings ? { ...defaultsFor('shared'), ...stored } : existing.settings,
      last_message_at: row.last_message_at !== undefined ? row.last_message_at : existing.last_message_at,
      last_message_sender:
        row.last_message_sender !== undefined ? row.last_message_sender : existing.last_message_sender,
      last_message_preview:
        row.last_message_preview !== undefined ? row.last_message_preview : existing.last_message_preview,
      updated_at: row.updated_at ?? existing.updated_at,
    };
    merged.unread = this.computeUnread(merged);
    const channels = this.state.channels
      .map((c) => (c.id === row.id ? merged : c))
      .sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || a.position - b.position);
    this.set({ channels });
    this.deps.cache.saveChannels(channels);
    if (existing.settings.read_receipts !== merged.settings.read_receipts) void this.refreshPartnerReads();
  }

  private computeUnread(c: Channel): boolean {
    if (!c.last_message_at || c.last_message_sender === this.deps.userId) return false;
    if (this.activeChannelId === c.id) return false;
    return !c.last_read_at || ts(c.last_message_at) > ts(c.last_read_at);
  }

  private handleTyping(channelId: string): void {
    const channel = this.state.channels.find((c) => c.id === channelId);
    if (channel && !isOn(channel, 'typing_indicator')) return;
    this.set({ typing: { ...this.state.typing, [channelId]: this.now() + TYPING_VISIBLE_MS } });
    const prev = this.typingTimers.get(channelId);
    if (prev) clearTimeout(prev);
    this.typingTimers.set(
      channelId,
      setTimeout(() => this.clearTyping(channelId), TYPING_VISIBLE_MS)
    );
  }

  private clearTyping(channelId: string): void {
    if (!(channelId in this.state.typing)) return;
    const { [channelId]: _gone, ...rest } = this.state.typing;
    this.set({ typing: rest });
  }

  private handlePartnerRead(channelId: string, at: string): void {
    const channel = this.state.channels.find((c) => c.id === channelId);
    if (!channel || !isOn(channel, 'read_receipts')) return;
    if (ts(this.state.partnerReads[channelId]) >= ts(at)) return;
    const partnerReads = { ...this.state.partnerReads, [channelId]: at };
    this.set({ partnerReads });
    this.deps.cache.saveReads(partnerReads);
  }

  private handlePresence(members: RoomPresence[]): void {
    const partnerInRoom = members.some((m) => m.userId !== this.deps.userId && m.inRoom);
    if (partnerInRoom !== this.state.partnerInRoom) this.set({ partnerInRoom });
  }

  // ----- merging -----
  private timeline(channelId: string): Timeline {
    return this.state.timelines[channelId] ?? EMPTY_TIMELINE;
  }

  private setTimeline(channelId: string, tl: Timeline): void {
    this.set({ timelines: { ...this.state.timelines, [channelId]: tl } });
  }

  private mergeRows(rows: Message[], advance: boolean): void {
    const before = this.state.timelines;
    const timelines = applyToTimelines(before, rows);
    if (timelines !== before) this.set({ timelines });
    if (advance) this.advanceCursor(rows);
    for (const id of new Set(rows.map((r) => r.channel_id))) this.persistTimeline(id);
    // A move also changed the source timeline.
    for (const [id, tl] of Object.entries(timelines)) {
      if (before[id] && before[id] !== tl && !rows.some((r) => r.channel_id === id)) this.persistTimeline(id);
    }
  }

  private advanceCursor(rows: Message[]): void {
    const next = maxUpdatedAt(rows, this.cursor);
    if (next !== this.cursor) {
      this.cursor = next;
      this.deps.cache.saveCursor(next);
    }
  }

  private persistTimeline(channelId: string): void {
    const tl = this.state.timelines[channelId];
    if (tl) this.deps.cache.saveMessages(channelId, cacheSlice(tl.messages));
  }

  // ----- sending -----
  send(channelId: string, draft: Draft): string {
    const couple = this.state.couple;
    if (!couple) throw new Error('Not paired');
    const body = draft.body.trim();
    const entry: OutboxEntry = {
      id: this.deps.uuid(),
      couple_id: couple.couple_id,
      channel_id: channelId,
      sender_id: this.deps.userId,
      kind: draft.upload?.kind ?? 'text',
      body: body.length > 0 ? body : null,
      reply_to_id: draft.replyToId ?? null,
      urgent: draft.urgent ?? false,
      created_at: new Date(this.now()).toISOString(),
      attempts: 0,
      status: 'sending',
      upload: draft.upload
        ? {
            uri: draft.upload.uri,
            mime: draft.upload.mime,
            name: draft.upload.name,
            width: draft.upload.width,
            height: draft.upload.height,
            duration_ms: draft.upload.duration_ms,
          }
        : undefined,
    };
    if (entry.kind === 'text' && !entry.body) throw new Error('Message is empty');
    this.outbox = [...this.outbox, entry];
    this.deps.cache.saveOutbox(this.outbox);
    this.mergeRows([toTimelineMessage(entry)], false);
    this.bumpChannelForSend(entry);
    void this.flushOutbox();
    return entry.id;
  }

  // The sender's own channel row reflects the send immediately (preview,
  // order of recency) without waiting for Realtime.
  private bumpChannelForSend(entry: OutboxEntry): void {
    const channels = this.state.channels.map((c) =>
      c.id === entry.channel_id
        ? {
            ...c,
            last_message_at: entry.created_at,
            last_message_sender: entry.sender_id,
            last_message_preview:
              entry.kind === 'image' && !entry.body ? 'Photo' : entry.kind === 'voice' ? 'Voice note' : entry.body,
            last_read_at: entry.created_at,
            unread: false,
          }
        : c
    );
    this.set({ channels });
  }

  private updateEntry(id: string, patch: Partial<OutboxEntry>): void {
    this.outbox = this.outbox.map((e) => (e.id === id ? { ...e, ...patch } : e));
    this.deps.cache.saveOutbox(this.outbox);
    const entry = this.outbox.find((e) => e.id === id);
    if (entry) this.mergeRows([toTimelineMessage(entry)], false);
  }

  private dropEntry(id: string): void {
    this.outbox = this.outbox.filter((e) => e.id !== id);
    this.deps.cache.saveOutbox(this.outbox);
  }

  async flushOutbox(): Promise<void> {
    if (this.flushing || this.state.phase !== 'paired') return;
    this.flushing = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    let retryIn: number | null = null;
    try {
      // In order: a conversation must not reorder because a later message
      // happened to be shorter.
      for (const entry of [...this.outbox]) {
        if (this.stopped) return;
        if (entry.status !== 'sending') continue;
        try {
          let attachment = entry.attachment;
          if (!attachment && entry.upload) {
            const path = attachmentPath(entry.couple_id, entry.id, entry.upload.name);
            const data = await this.deps.readFile(entry.upload.uri);
            await this.deps.api.uploadAttachment(path, data, entry.upload.mime);
            attachment = {
              path,
              width: entry.upload.width,
              height: entry.upload.height,
              duration_ms: entry.upload.duration_ms,
              mime: entry.upload.mime,
            };
            this.updateEntry(entry.id, { attachment });
          }
          const row = await this.deps.api.sendMessage({
            id: entry.id,
            channelId: entry.channel_id,
            body: entry.body,
            kind: entry.kind,
            attachment: attachment ?? null,
            replyToId: entry.reply_to_id,
            urgent: entry.urgent,
          });
          this.dropEntry(entry.id);
          // Not a cursor move: the partner's changes before this row may not
          // have reached this device yet (catchUp owns the cursor).
          this.mergeRows([{ ...row, previewUri: entry.upload?.uri } as TimelineMessage], false);
          this.deps.api.notifyMessage(row.id);
        } catch (err) {
          if (isRefusal(err)) {
            this.updateEntry(entry.id, { status: 'failed', error: refusalMessage(err) });
            continue;
          }
          const attempts = entry.attempts + 1;
          this.updateEntry(entry.id, { attempts });
          retryIn = retryDelayMs(attempts);
          // Later messages wait behind the stuck one (order matters).
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
    if (retryIn !== null && !this.stopped) {
      this.retryTimer = setTimeout(() => void this.flushOutbox(), retryIn);
    }
  }

  retry(id: string): void {
    this.updateEntry(id, { status: 'sending', attempts: 0, error: undefined });
    void this.flushOutbox();
  }

  discard(id: string): void {
    const entry = this.outbox.find((e) => e.id === id);
    if (!entry) return;
    this.dropEntry(id);
    const tl = this.timeline(entry.channel_id);
    this.setTimeline(entry.channel_id, { ...tl, messages: removeMessage(tl.messages, id) });
  }

  pendingCount(): number {
    return this.outbox.filter((e) => e.status === 'sending').length;
  }

  // ----- message actions (optimistic, reverted on failure) -----
  private findMessage(id: string): TimelineMessage | undefined {
    for (const tl of Object.values(this.state.timelines)) {
      const m = tl.messages.find((x) => x.id === id);
      if (m) return m;
    }
    return undefined;
  }

  private async optimistic(
    id: string,
    patch: Partial<TimelineMessage>,
    write: () => Promise<unknown>
  ): Promise<void> {
    const before = this.findMessage(id);
    if (!before) return;
    const tl = this.timeline(before.channel_id);
    this.setTimeline(before.channel_id, { ...tl, messages: patchMessage(tl.messages, id, patch) });
    try {
      await write();
    } catch (err) {
      const now = this.timeline(before.channel_id);
      this.setTimeline(before.channel_id, { ...now, messages: patchMessage(now.messages, id, before) });
      throw err;
    }
  }

  async edit(id: string, body: string): Promise<void> {
    const text = body.trim();
    if (!text) throw new Error('Message is empty');
    await this.optimistic(id, { body: text, edited_at: new Date(this.now()).toISOString() }, async () => {
      const row = await this.deps.api.editMessage(id, text);
      this.mergeRows([row], false);
    });
  }

  async remove(id: string): Promise<void> {
    await this.optimistic(
      id,
      { deleted_at: new Date(this.now()).toISOString(), body: null, attachment: null, reactions: {} },
      async () => {
        const path = await this.deps.api.deleteMessage(id);
        if (path) void this.deps.api.removeAttachment(path).catch(() => {});
      }
    );
  }

  async setDone(id: string, done: boolean): Promise<void> {
    await this.optimistic(
      id,
      { done_at: done ? new Date(this.now()).toISOString() : null, done_by: done ? this.deps.userId : null },
      () => this.deps.api.setMessageDone(id, done)
    );
  }

  async toggleReaction(id: string, reaction: string): Promise<void> {
    const m = this.findMessage(id);
    if (!m) return;
    const mine = (m.reactions[reaction] ?? []).includes(this.deps.userId);
    const list = mine
      ? (m.reactions[reaction] ?? []).filter((u) => u !== this.deps.userId)
      : [...(m.reactions[reaction] ?? []), this.deps.userId];
    const reactions = { ...m.reactions };
    if (list.length === 0) delete reactions[reaction];
    else reactions[reaction] = list;
    await this.optimistic(id, { reactions }, () => this.deps.api.setReaction(id, reaction, !mine));
  }

  async move(id: string, channelId: string): Promise<void> {
    const m = this.findMessage(id);
    if (!m || m.channel_id === channelId) return;
    await this.deps.api.moveMessage(id, channelId);
    this.mergeRows([{ ...m, channel_id: channelId, moved_from_channel_id: m.channel_id }], false);
  }

  // ----- reading -----
  markRead(channelId: string): void {
    const tl = this.timeline(channelId);
    const latest = [...tl.messages].reverse().find((m) => !m.local);
    const channel = this.state.channels.find((c) => c.id === channelId);
    if (!latest || !channel) return;
    if (channel.last_read_at && ts(channel.last_read_at) >= ts(latest.created_at) && !channel.unread) return;
    const at = latest.created_at;
    this.set({
      channels: this.state.channels.map((c) =>
        c.id === channelId ? { ...c, last_read_at: at, unread: false } : c
      ),
    });
    this.deps.api.markChannelRead(channelId, at).catch((err) => console.error('mark read failed:', err));
    if (isOn(channel, 'read_receipts')) this.live?.sendRead(channelId, at);
  }

  notifyTyping(channelId: string): void {
    const channel = this.state.channels.find((c) => c.id === channelId);
    if (channel && isOn(channel, 'typing_indicator')) this.live?.sendTyping(channelId);
  }

  // ----- channels & settings -----
  async setSetting(channelId: string, key: string, value: SettingValue): Promise<void> {
    const before = this.state.channels.find((c) => c.id === channelId);
    if (!before) return;
    this.channelEpoch++;
    this.set({ channels: this.state.channels.map((c) => (c.id === channelId ? withSetting(c, key, value) : c)) });
    try {
      await this.deps.api.setChannelSetting(channelId, key, value);
      this.channelEpoch++;
      this.deps.cache.saveChannels(this.state.channels);
      if (key === 'read_receipts') void this.refreshPartnerReads();
    } catch (err) {
      this.set({ channels: this.state.channels.map((c) => (c.id === channelId ? before : c)) });
      throw err;
    }
  }

  async createChannel(name: string, icon: string, preset: string): Promise<string> {
    const id = this.deps.uuid();
    await this.deps.api.createChannel(id, name.trim(), icon, preset);
    await this.refreshChannels();
    return id;
  }

  async updateChannel(id: string, fields: { name?: string; icon?: string }): Promise<void> {
    this.channelEpoch++;
    await this.deps.api.updateChannel(id, fields);
    this.channelEpoch++;
    this.set({ channels: this.state.channels.map((c) => (c.id === id ? { ...c, ...fields } : c)) });
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    await this.deps.api.setChannelArchived(id, archived);
    await this.refreshChannels();
  }

  async reorder(ids: string[]): Promise<void> {
    const before = this.state.channels;
    this.channelEpoch++;
    const pos = new Map(ids.map((id, i) => [id, i + 1]));
    this.set({
      channels: [...before]
        .map((c) => (pos.has(c.id) ? { ...c, position: pos.get(c.id)! } : c))
        .sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || a.position - b.position),
    });
    try {
      await this.deps.api.reorderChannels(ids);
      this.channelEpoch++;
      this.deps.cache.saveChannels(this.state.channels);
    } catch (err) {
      this.set({ channels: before });
      throw err;
    }
  }

  // ----- pairing -----
  async createCouple(): Promise<void> {
    await this.deps.api.createCouple();
    await this.refresh();
  }

  async joinCouple(code: string): Promise<JoinStatus> {
    const status = await this.deps.api.joinCouple(code);
    if (status === 'paired' || status === 'already_paired') await this.refresh();
    return status;
  }

  async cancelInvite(): Promise<void> {
    await this.deps.api.cancelInvite();
    await this.refresh();
  }

  // ----- the room -----
  setInRoom(inRoom: boolean): void {
    this.set({ meInRoom: inRoom });
    this.live?.setInRoom(inRoom);
  }
}
