import { attachmentPath, isRefusal, retryDelayMs, toTimelineMessage, type OutboxEntry } from '../../lib/outbox';

describe('outbox', () => {
  it('a server refusal stops retries; timeouts and network errors do not', () => {
    expect(isRefusal({ code: 'P0001', message: 'Channel is archived' })).toBe(true);
    expect(isRefusal({ code: '23503', message: 'fk' })).toBe(true);
    expect(isRefusal(Object.assign(new Error('Timed out'), { name: 'AbortError' }))).toBe(false);
    expect(isRefusal(new TypeError('Failed to fetch'))).toBe(false);
    expect(isRefusal({ code: '500' })).toBe(false);
  });

  it('backs off 1s, 2s, 4s … capped at 30s', () => {
    expect([1, 2, 3, 10].map(retryDelayMs)).toEqual([1000, 2000, 4000, 30000]);
  });

  it('attachment paths live in the couple folder, keyed on the message id', () => {
    expect(attachmentPath('c1', 'm1', 'My photo (1).jpg')).toBe('c1/m1/My_photo__1_.jpg');
  });

  it('renders a pending entry as a sending bubble with its device preview', () => {
    const entry: OutboxEntry = {
      id: 'm1',
      couple_id: 'c1',
      channel_id: 'ch',
      sender_id: 'me',
      kind: 'image',
      body: null,
      reply_to_id: null,
      urgent: false,
      created_at: '2026-11-18T10:00:00.000Z',
      attempts: 0,
      status: 'sending',
      upload: { uri: 'file:///p.jpg', mime: 'image/jpeg', name: 'p.jpg', width: 10, height: 20 },
    };
    const m = toTimelineMessage(entry);
    expect(m.local?.status).toBe('sending');
    expect(m.previewUri).toBe('file:///p.jpg');
    expect(m.attachment).toMatchObject({ width: 10, height: 20 });
  });
});
