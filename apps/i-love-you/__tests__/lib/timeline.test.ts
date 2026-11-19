import {
  EMPTY_TIMELINE,
  applyToTimelines,
  cacheSlice,
  compareMessages,
  maxUpdatedAt,
  upsertMessages,
} from '../../lib/timeline';
import type { TimelineMessage } from '../../lib/types';

// The merge rules that make optimistic send, Realtime, catch-up and the local
// cache agree (lib/timeline.ts header).

function msg(id: string, over: Partial<TimelineMessage> = {}): TimelineMessage {
  return {
    id,
    couple_id: 'c',
    channel_id: 'ch1',
    sender_id: 'me',
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

describe('upsertMessages', () => {
  it('keeps one row per id and orders by (created_at, id)', () => {
    const list = upsertMessages([], [
      msg('b', { created_at: '2026-11-18T10:00:02.000Z' }),
      msg('a', { created_at: '2026-11-18T10:00:01.000Z' }),
    ]);
    const again = upsertMessages(list, [msg('a', { created_at: '2026-11-18T10:00:01.000Z' })]);
    expect(again.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('a server row replaces the optimistic copy of the same id', () => {
    const local = msg('x', { local: { status: 'sending' } });
    const server = msg('x', { updated_at: '2026-11-18T09:00:00.000Z', body: 'server' });
    const out = upsertMessages([local], [server]);
    expect(out).toHaveLength(1);
    expect(out[0].local).toBeUndefined();
    expect(out[0].body).toBe('server');
  });

  it('an optimistic copy never overwrites a confirmed row', () => {
    const server = msg('x', { body: 'server' });
    const out = upsertMessages([server], [msg('x', { body: 'local', local: { status: 'sending' } })]);
    expect(out[0].body).toBe('server');
  });

  it('an older server row never overwrites a newer one (out-of-order delivery)', () => {
    const newer = msg('x', { body: 'edited', updated_at: '2026-11-18T10:05:00.000Z' });
    const older = msg('x', { body: 'original', updated_at: '2026-11-18T10:00:00.000Z' });
    expect(upsertMessages([newer], [older])[0].body).toBe('edited');
  });

  it('keeps the device preview across confirmation', () => {
    const local = msg('p', { kind: 'image', local: { status: 'sending' }, previewUri: 'blob:1' });
    const out = upsertMessages([local], [msg('p', { kind: 'image' })]);
    expect(out[0].previewUri).toBe('blob:1');
  });

  it('returns the same array when nothing changed (cheap re-render)', () => {
    const list = [msg('a')];
    expect(upsertMessages(list, [msg('a')])).toBe(list);
    expect(upsertMessages(list, [])).toBe(list);
  });
});

describe('compareMessages', () => {
  it('breaks a millisecond tie with the raw microsecond timestamp, then id', () => {
    const a = msg('z', { created_at: '2026-11-18T10:00:00.000100+00:00' });
    const b = msg('a', { created_at: '2026-11-18T10:00:00.000200+00:00' });
    expect(compareMessages(a, b)).toBeLessThan(0);
    expect(compareMessages(msg('a'), msg('b'))).toBeLessThan(0);
  });
});

describe('applyToTimelines', () => {
  it('moves a message between channels when its channel_id changes', () => {
    const start = { ch1: { ...EMPTY_TIMELINE, messages: [msg('m')] } };
    const out = applyToTimelines(start, [msg('m', { channel_id: 'ch2', updated_at: '2026-11-18T11:00:00.000Z' })]);
    expect(out.ch1.messages).toHaveLength(0);
    expect(out.ch2.messages.map((m) => m.id)).toEqual(['m']);
  });
});

describe('cacheSlice and cursor', () => {
  it('caches confirmed rows only, without local fields', () => {
    const slice = cacheSlice([msg('a'), msg('b', { local: { status: 'sending' } }), msg('c', { previewUri: 'x' })]);
    expect(slice.map((m) => m.id)).toEqual(['a', 'c']);
    expect(slice[1]).not.toHaveProperty('previewUri');
  });

  it('maxUpdatedAt advances monotonically', () => {
    expect(maxUpdatedAt([msg('a', { updated_at: '2026-11-18T12:00:00Z' })], '2026-11-18T13:00:00Z')).toBe(
      '2026-11-18T13:00:00Z'
    );
    expect(maxUpdatedAt([msg('a', { updated_at: '2026-11-18T14:00:00Z' })], null)).toBe('2026-11-18T14:00:00Z');
  });
});
