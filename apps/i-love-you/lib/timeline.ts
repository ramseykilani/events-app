import type { Message, TimelineMessage } from './types';

// Pure timeline operations — the part of the chat engine that decides what a
// conversation shows. Kept free of React and I/O so Jest can pin the merge
// rules that make optimistic send, realtime, catch-up and the local cache
// agree:
//   - one row per id, ever (optimistic, realtime and catch-up copies merge);
//   - a server row replaces the optimistic copy of the same id;
//   - an older server row never overwrites a newer one (Realtime and the
//     catch-up feed can arrive out of order);
//   - order is (created_at, id), the same key the server pages on.

export type Timeline = {
  messages: TimelineMessage[];
  // false once a page came back short — the start of history is on screen.
  hasOlder: boolean;
  // true once the newest page was fetched this session (cache alone = false).
  fresh: boolean;
};

export const EMPTY_TIMELINE: Timeline = { messages: [], hasOlder: true, fresh: false };

function ts(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export function compareMessages(a: Pick<Message, 'created_at' | 'id'>, b: Pick<Message, 'created_at' | 'id'>): number {
  const d = ts(a.created_at) - ts(b.created_at);
  if (d !== 0) return d;
  // Postgres timestamps carry microseconds that Date.parse drops; compare the
  // raw strings first when both come from the server, then the id.
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Is `incoming` at least as new as `existing`? Optimistic copies always lose
// to a server row.
function supersedes(existing: TimelineMessage, incoming: TimelineMessage): boolean {
  if (existing.local && !incoming.local) return true;
  if (!existing.local && incoming.local) return false;
  // The same row again (Realtime echo of a row the catch-up already
  // delivered): Postgres timestamps carry microseconds, so equal raw strings
  // mean nothing changed.
  if (incoming.updated_at === existing.updated_at && !existing.local) return false;
  return ts(incoming.updated_at) >= ts(existing.updated_at);
}

export function upsertMessages(list: TimelineMessage[], incoming: TimelineMessage[]): TimelineMessage[] {
  if (incoming.length === 0) return list;
  const byId = new Map(list.map((m) => [m.id, m]));
  let changed = false;
  for (const m of incoming) {
    const existing = byId.get(m.id);
    if (!existing || supersedes(existing, m)) {
      // Keep the device preview after confirmation so a photo the sender
      // just picked does not flash while its signed URL loads.
      const previewUri = m.previewUri ?? existing?.previewUri;
      byId.set(m.id, previewUri ? { ...m, previewUri } : m);
      changed = true;
    }
  }
  if (!changed) return list;
  return Array.from(byId.values()).sort(compareMessages);
}

export function removeMessage(list: TimelineMessage[], id: string): TimelineMessage[] {
  const next = list.filter((m) => m.id !== id);
  return next.length === list.length ? list : next;
}

export function patchMessage(
  list: TimelineMessage[],
  id: string,
  patch: Partial<TimelineMessage>
): TimelineMessage[] {
  let hit = false;
  const next = list.map((m) => {
    if (m.id !== id) return m;
    hit = true;
    return { ...m, ...patch };
  });
  return hit ? next : list;
}

// Route a row into the right channel's timeline. A moved message arrives
// with a new channel_id; any copy in another timeline is dropped.
export function applyToTimelines(
  timelines: Record<string, Timeline>,
  rows: TimelineMessage[]
): Record<string, Timeline> {
  let next = timelines;
  for (const row of rows) {
    for (const [channelId, tl] of Object.entries(next)) {
      if (channelId !== row.channel_id && tl.messages.some((m) => m.id === row.id)) {
        next = { ...next, [channelId]: { ...tl, messages: removeMessage(tl.messages, row.id) } };
      }
    }
    const target = next[row.channel_id] ?? EMPTY_TIMELINE;
    const merged = upsertMessages(target.messages, [row]);
    if (merged !== target.messages || !next[row.channel_id]) {
      next = { ...next, [row.channel_id]: { ...target, messages: merged } };
    }
  }
  return next;
}

// What the local cache keeps per channel: the newest confirmed messages.
// Pending ones live in the outbox, which is persisted separately.
export const CACHE_MESSAGES_PER_CHANNEL = 200;

export function cacheSlice(list: TimelineMessage[]): Message[] {
  const confirmed = list.filter((m) => !m.local);
  return confirmed.slice(-CACHE_MESSAGES_PER_CHANNEL).map((m) => {
    const { local: _local, previewUri: _preview, ...rest } = m;
    return rest;
  });
}

// The newest updated_at across rows — the catch-up cursor.
export function maxUpdatedAt(rows: Pick<Message, 'updated_at'>[], current: string | null): string | null {
  let best = current;
  for (const r of rows) {
    if (!best || ts(r.updated_at) > ts(best) || (ts(r.updated_at) === ts(best) && r.updated_at > best)) {
      best = r.updated_at;
    }
  }
  return best;
}

// The last message in a timeline the reader has not seen yet, used to place
// the "new messages" line.
export function firstUnreadIndex(list: TimelineMessage[], lastReadAt: string | null, me: string): number {
  if (!lastReadAt) return -1;
  const at = ts(lastReadAt);
  return list.findIndex((m) => m.sender_id !== me && ts(m.created_at) > at);
}
