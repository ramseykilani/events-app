import { ChatEngine, type EngineDeps } from '../../lib/chatEngine';
import type { Api } from '../../lib/api';
import type { Cache, CacheSnapshot } from '../../lib/cache';
import type { LiveHandlers } from '../../lib/realtime';
import type { Channel, Couple, Message } from '../../lib/types';

// ChatEngine through its injected seam (the same seam production uses):
// a fake Api, an in-memory cache and a hand-driven live connection.

const ME = 'me-0000';
const PARTNER = 'partner-0000';
const COUPLE: Couple = {
  couple_id: 'couple-1',
  paired_at: '2026-11-18T00:00:00Z',
  invite_code: null,
  invite_expires_at: null,
  my_id: ME,
  my_display_name: 'Ramsey',
  partner_id: PARTNER,
  partner_display_name: 'Natasha',
};

function channel(id: string, over: Partial<Channel> = {}): Channel {
  return {
    id,
    name: id,
    icon: 'leaf-outline',
    position: 1,
    archived_at: null,
    settings: { read_receipts: false, typing_indicator: true, items_completable: false, allow_urgent: false },
    my_settings: { notify_level: 'notify', notify_sound: 'default', notify_preview: true },
    last_message_at: null,
    last_message_sender: null,
    last_message_preview: null,
    last_read_at: null,
    unread: false,
    updated_at: '2026-11-18T00:00:00Z',
    ...over,
  };
}

function row(id: string, over: Partial<Message> = {}): Message {
  return {
    id,
    couple_id: 'couple-1',
    channel_id: 'ch1',
    sender_id: ME,
    kind: 'text',
    body: id,
    attachment: null,
    reply_to_id: null,
    reactions: {},
    urgent: false,
    created_at: '2026-11-18T10:00:00.000Z',
    updated_at: '2026-11-18T10:00:00.000Z',
    edited_at: null,
    deleted_at: null,
    done_at: null,
    done_by: null,
    moved_from_channel_id: null,
    moved_at: null,
    ...over,
  };
}

function setup(opts: { snapshot?: Partial<CacheSnapshot>; api?: Partial<Record<keyof Api, jest.Mock>> } = {}) {
  let handlers: LiveHandlers | null = null;
  const live = { sendTyping: jest.fn(), sendRead: jest.fn(), setInRoom: jest.fn(), stop: jest.fn() };
  const api = {
    getMyCouple: jest.fn().mockResolvedValue(COUPLE),
    getChannels: jest.fn().mockResolvedValue([channel('ch1'), channel('ch2')]),
    getPresets: jest.fn().mockResolvedValue([]),
    getPartnerReads: jest.fn().mockResolvedValue({}),
    getMessages: jest.fn().mockResolvedValue([]),
    getMessageChanges: jest.fn().mockResolvedValue([]),
    getOpenItems: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn((input: { id: string; channelId: string; body: string }) =>
      Promise.resolve(row(input.id, { channel_id: input.channelId, body: input.body, updated_at: '2026-11-18T10:00:01.000Z' }))
    ),
    notifyMessage: jest.fn(),
    markChannelRead: jest.fn().mockResolvedValue(undefined),
    setChannelSetting: jest.fn().mockResolvedValue(true),
    setReaction: jest.fn().mockResolvedValue(true),
    editMessage: jest.fn(),
    deleteMessage: jest.fn().mockResolvedValue(null),
    removeAttachment: jest.fn().mockResolvedValue(undefined),
    uploadAttachment: jest.fn().mockResolvedValue(undefined),
    moveMessage: jest.fn().mockResolvedValue(true),
    ...opts.api,
  };
  const saved: Record<string, unknown> = {};
  const cache: Cache = {
    load: jest.fn().mockResolvedValue({
      couple: null,
      channels: [],
      partnerReads: {},
      cursor: null,
      outbox: [],
      ...opts.snapshot,
    }),
    loadMessages: jest.fn().mockResolvedValue([]),
    saveCouple: jest.fn(),
    saveChannels: jest.fn(),
    saveReads: jest.fn(),
    saveCursor: jest.fn((c) => (saved.cursor = c)),
    saveOutbox: jest.fn((o) => (saved.outbox = o)),
    saveMessages: jest.fn(),
    clear: jest.fn(),
  };
  let n = 0;
  const deps: EngineDeps = {
    api: api as unknown as Api,
    cache,
    connectLive: (_couple, _user, h) => {
      handlers = h;
      return live;
    },
    userId: ME,
    uuid: () => `uuid-${++n}`,
    readFile: jest.fn().mockResolvedValue(new ArrayBuffer(4)),
  };
  const engine = new ChatEngine(deps);
  return { engine, api, cache, live, saved, handlers: () => handlers! };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => jest.useRealTimers());

describe('ChatEngine', () => {
  it('renders the cache first, then the server (instant open)', async () => {
    const { engine, api } = setup({
      snapshot: { couple: COUPLE, channels: [channel('cached', { name: 'Cached' })] },
    });
    let resolve!: (v: Channel[]) => void;
    api.getChannels.mockReturnValue(new Promise((r) => (resolve = r)));
    const started = engine.start();
    await flush();
    expect(engine.state.phase).toBe('paired');
    expect(engine.state.channels.map((c) => c.name)).toEqual(['Cached']);
    resolve([channel('ch1')]);
    await started;
    expect(engine.state.channels.map((c) => c.id)).toEqual(['ch1']);
  });

  it('routes to pairing when there is no couple, and to waiting before the partner joins', async () => {
    const a = setup({ api: { getMyCouple: jest.fn().mockResolvedValue(null) } });
    await a.engine.start();
    expect(a.engine.state.phase).toBe('unpaired');
    const b = setup({ api: { getMyCouple: jest.fn().mockResolvedValue({ ...COUPLE, paired_at: null, invite_code: 'ABCDEFGH' }) } });
    await b.engine.start();
    expect(b.engine.state.phase).toBe('waiting');
  });

  it('keeps last-good state when a refresh fails (never blank)', async () => {
    const { engine, api } = setup({ snapshot: { couple: COUPLE, channels: [channel('cached')] } });
    api.getMyCouple.mockRejectedValue(new Error('offline'));
    await engine.start();
    expect(engine.state.phase).toBe('paired');
    expect(engine.state.channels).toHaveLength(1);
    expect(engine.state.refreshFailed).toBe(true);
  });

  it('sends optimistically, confirms, and notifies the partner exactly once', async () => {
    const { engine, api } = setup();
    await engine.start();
    const id = engine.send('ch1', { body: '  hello  ' });
    const pending = engine.state.timelines.ch1.messages.find((m) => m.id === id)!;
    expect(pending.body).toBe('hello');
    await flush();
    await flush();
    const confirmed = engine.state.timelines.ch1.messages.find((m) => m.id === id)!;
    expect(confirmed.local).toBeUndefined();
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(api.notifyMessage).toHaveBeenCalledWith(id);
    expect(engine.state.channels.find((c) => c.id === 'ch1')?.last_message_preview).toBe('hello');
  });

  it('retries a timed-out send with the same id (idempotent) until it lands', async () => {
    jest.useFakeTimers();
    const timeout = Object.assign(new Error('Timed out'), { name: 'AbortError' });
    const { engine, api } = setup();
    api.sendMessage.mockRejectedValueOnce(timeout);
    await engine.start();
    const id = engine.send('ch1', { body: 'are you up?' });
    await jest.advanceTimersByTimeAsync(0);
    expect(engine.state.timelines.ch1.messages.find((m) => m.id === id)?.local?.status).toBe('sending');
    await jest.advanceTimersByTimeAsync(1000);
    expect(api.sendMessage).toHaveBeenCalledTimes(2);
    expect(api.sendMessage.mock.calls[0][0].id).toBe(api.sendMessage.mock.calls[1][0].id);
    expect(engine.state.timelines.ch1.messages.find((m) => m.id === id)?.local).toBeUndefined();
    engine.stop();
  });

  it('a refusal marks the message failed; Retry and Discard are the person’s call', async () => {
    const { engine, api, saved } = setup();
    api.sendMessage.mockRejectedValueOnce({ code: 'P0001', message: 'Channel is archived' });
    await engine.start();
    const id = engine.send('ch1', { body: 'into the archive' });
    await flush();
    await flush();
    const m = engine.state.timelines.ch1.messages.find((x) => x.id === id)!;
    expect(m.local).toEqual({ status: 'failed', error: 'Channel is archived' });
    expect((saved.outbox as unknown[]).length).toBe(1);
    engine.retry(id);
    await flush();
    await flush();
    expect(engine.state.timelines.ch1.messages.find((x) => x.id === id)?.local).toBeUndefined();
    const id2 = engine.send('ch2', { body: 'x' });
    api.sendMessage.mockRejectedValueOnce({ code: 'P0001', message: 'no' });
    engine.discard(id2);
    expect(engine.state.timelines.ch2.messages.find((x) => x.id === id2)).toBeUndefined();
  });

  it('a pending message from the persisted outbox is resent after a restart', async () => {
    const { engine, api } = setup({
      snapshot: {
        couple: COUPLE,
        outbox: [
          {
            id: 'left-over',
            couple_id: 'couple-1',
            channel_id: 'ch1',
            sender_id: ME,
            kind: 'text',
            body: 'typed before the app was killed',
            reply_to_id: null,
            urgent: false,
            created_at: '2026-11-18T09:00:00.000Z',
            attempts: 2,
            status: 'sending',
          },
        ],
      },
    });
    await engine.start();
    await flush();
    expect(api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'left-over' }));
  });

  it('merges live partner messages, raises incoming, and clears their typing', async () => {
    const { engine, handlers } = setup();
    await engine.start();
    const incoming = jest.fn();
    engine.onIncoming(incoming);
    handlers().onTyping('ch1', PARTNER);
    expect(engine.state.typing.ch1).toBeGreaterThan(Date.now());
    handlers().onMessage(row('p1', { sender_id: PARTNER, body: 'hi' }));
    expect(engine.state.timelines.ch1.messages.map((m) => m.id)).toEqual(['p1']);
    expect(engine.state.typing.ch1).toBeUndefined();
    expect(incoming).toHaveBeenCalledTimes(1);
    // An update to the same row (an edit) is not a new message.
    handlers().onMessage(row('p1', { sender_id: PARTNER, body: 'hi!', updated_at: '2026-11-18T10:01:00.000Z' }));
    expect(incoming).toHaveBeenCalledTimes(1);
    expect(engine.state.timelines.ch1.messages[0].body).toBe('hi!');
    engine.stop();
  });

  it('typing is ignored where the shared typing_indicator setting is off', async () => {
    const { engine, api, handlers, live } = setup();
    api.getChannels.mockResolvedValue([channel('ch1', { settings: { typing_indicator: false } })]);
    await engine.start();
    handlers().onTyping('ch1', PARTNER);
    expect(engine.state.typing.ch1).toBeUndefined();
    engine.notifyTyping('ch1');
    expect(live.sendTyping).not.toHaveBeenCalled();
  });

  it('every (re)subscribe runs the catch-up feed from the cursor', async () => {
    const { engine, api, handlers } = setup({ snapshot: { couple: COUPLE, cursor: '2026-11-18T09:00:00.000Z' } });
    await engine.start();
    api.getMessageChanges.mockClear();
    api.getMessageChanges.mockResolvedValueOnce([row('missed', { sender_id: PARTNER, updated_at: '2026-11-18T11:00:00.000Z' })]);
    handlers().onStatus('offline');
    handlers().onStatus('live');
    await flush();
    expect(api.getMessageChanges).toHaveBeenCalledWith('2026-11-18T09:00:00.000Z', 200);
    expect(engine.state.timelines.ch1.messages.map((m) => m.id)).toContain('missed');
  });

  it('markRead clears the dot, writes the position, and broadcasts only with receipts on', async () => {
    const { engine, api, live, handlers } = setup();
    api.getChannels.mockResolvedValue([
      channel('ch1', { unread: true, last_message_at: '2026-11-18T10:00:00.000Z', last_message_sender: PARTNER }),
    ]);
    await engine.start();
    handlers().onMessage(row('p1', { sender_id: PARTNER }));
    engine.markRead('ch1');
    expect(engine.state.channels[0].unread).toBe(false);
    expect(api.markChannelRead).toHaveBeenCalledWith('ch1', '2026-11-18T10:00:00.000Z');
    expect(live.sendRead).not.toHaveBeenCalled();
  });

  it('a setting change is optimistic and reverts when the server refuses', async () => {
    const { engine, api } = setup();
    await engine.start();
    api.setChannelSetting.mockRejectedValueOnce(new Error('nope'));
    const attempt = engine.setSetting('ch1', 'notify_level', 'quiet');
    expect(engine.state.channels[0].my_settings.notify_level).toBe('quiet');
    await expect(attempt).rejects.toThrow('nope');
    expect(engine.state.channels[0].my_settings.notify_level).toBe('notify');
  });

  it('reactions toggle per person, optimistically', async () => {
    const { engine, api, handlers } = setup();
    await engine.start();
    handlers().onMessage(row('m1', { sender_id: PARTNER, reactions: { heart: [PARTNER] } }));
    await engine.toggleReaction('m1', 'heart');
    expect(api.setReaction).toHaveBeenCalledWith('m1', 'heart', true);
    expect(engine.state.timelines.ch1.messages[0].reactions.heart).toEqual([PARTNER, ME]);
    await engine.toggleReaction('m1', 'heart');
    expect(api.setReaction).toHaveBeenLastCalledWith('m1', 'heart', false);
    expect(engine.state.timelines.ch1.messages[0].reactions.heart).toEqual([PARTNER]);
  });

  it('moving a message takes it out of one timeline and into the other', async () => {
    const { engine, handlers } = setup();
    await engine.start();
    handlers().onMessage(row('m1', { sender_id: PARTNER }));
    await engine.move('m1', 'ch2');
    expect(engine.state.timelines.ch1.messages).toHaveLength(0);
    expect(engine.state.timelines.ch2.messages[0]).toMatchObject({ id: 'm1', moved_from_channel_id: 'ch1' });
  });

  it('a live channel row keeps registry defaults and recomputes unread', async () => {
    const { engine, handlers } = setup();
    await engine.start();
    handlers().onChannel(
      {
        id: 'ch1',
        settings: { items_completable: true },
        last_message_at: '2026-11-18T12:00:00Z',
        last_message_sender: PARTNER,
      } as Partial<Channel> & { id: string },
      false
    );
    const c = engine.state.channels.find((x) => x.id === 'ch1')!;
    expect(c.settings).toMatchObject({ items_completable: true, typing_indicator: true, read_receipts: false });
    expect(c.unread).toBe(true);
  });
});
