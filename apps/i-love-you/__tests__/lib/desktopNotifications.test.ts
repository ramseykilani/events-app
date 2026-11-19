/**
 * @jest-environment jsdom
 */
// The desktop (web/PWA/Tauri) notification path, lib/notifications.ts — the
// explicit .ts path skips jest-expo's native resolution. Same per-channel
// levels as push: notify sounds, quiet is silent, off never shows (unless
// "needs you now"), and nothing shows for the channel already on screen.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { presentIncoming, setActiveChannel } = require('../../lib/notifications.ts') as typeof import('../../lib/notifications');
import type { Channel, Message } from '../../lib/types';

const created: { title: string; opts: NotificationOptions }[] = [];
class FakeNotification {
  static permission = 'granted';
  onclick: (() => void) | null = null;
  constructor(title: string, opts: NotificationOptions) {
    created.push({ title, opts });
  }
  close() {}
}

const channel = (my: Record<string, string>): Channel => ({
  id: 'ch1',
  name: 'Heart-to-heart',
  icon: 'heart-outline',
  position: 1,
  archived_at: null,
  settings: {},
  my_settings: my,
  last_message_at: null,
  last_message_sender: null,
  last_message_preview: null,
  last_read_at: null,
  unread: false,
  updated_at: '',
});
const message = (over: Partial<Message> = {}) =>
  ({ id: 'm', channel_id: 'ch1', kind: 'text', body: 'can we talk tonight', urgent: false, ...over }) as Message;

beforeEach(() => {
  created.length = 0;
  Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true });
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  setActiveChannel(null);
});

describe('desktop notifications', () => {
  it('titles by channel and follows the per-channel level', () => {
    presentIncoming(message(), channel({}), 'Natasha');
    expect(created[0]).toMatchObject({ title: 'Heart-to-heart', opts: { body: 'can we talk tonight', silent: false } });
    presentIncoming(message(), channel({ notify_level: 'quiet' }), 'Natasha');
    expect(created[1].opts.silent).toBe(true);
    presentIncoming(message(), channel({ notify_level: 'none' }), 'Natasha');
    expect(created).toHaveLength(2);
    presentIncoming(message({ urgent: true }), channel({ notify_level: 'none' }), 'Natasha');
    expect(created[2]).toMatchObject({ title: 'Needs you now · Heart-to-heart', opts: { requireInteraction: true } });
  });

  it('hides the text when the reader turned previews off', () => {
    presentIncoming(message(), channel({ notify_preview: false } as never), 'Natasha');
    expect(created[0].opts.body).toBe('New message');
  });

  it('stays quiet for the conversation already on screen', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    setActiveChannel('ch1');
    presentIncoming(message(), channel({}), 'Natasha');
    expect(created).toHaveLength(0);
  });
});
