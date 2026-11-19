import {
  CHIME_SOUND_FILE,
  MESSAGE_CATEGORY,
  RING_ANDROID_CHANNEL,
  URGENT_ANDROID_CHANNEL,
  androidChannelId,
  buildMessagePush,
  buildRingPush,
  messageExcerpt,
} from '../../supabase/functions/_shared/notificationPayload';
import { desiredAndroidChannels, staleAndroidChannels } from '../../lib/notificationChannels';
import type { Channel } from '../../lib/types';

// The notification grammar (FEATURES.md -> Notifications): the title is the
// channel, the body is the message, and every per-channel personal setting
// shapes the push. Pinned here because no automated test can observe a real
// device notification.

const base = {
  token: 'ExponentPushToken[x]',
  channel: { id: '11111111-1111-1111-1111-111111111111', name: 'Logistics' },
  senderName: 'Natasha',
  message: { id: 'm1', kind: 'text', body: 'Did you book the vet?', urgent: false },
};

describe('buildMessagePush', () => {
  it('notify: channel title, message body, sound, active, per-channel thread and Android channel', () => {
    const p = buildMessagePush({ ...base, settings: {} })!;
    expect(p.title).toBe('Logistics');
    expect(p.subtitle).toBe('Natasha');
    expect(p.body).toBe('Did you book the vet?');
    expect(p.sound).toBe('default');
    expect(p.interruptionLevel).toBe('active');
    expect(p.threadId).toBe(base.channel.id);
    expect(p.channelId).toBe(androidChannelId(base.channel.id, 'notify', 'default'));
    expect(p.categoryId).toBe(MESSAGE_CATEGORY);
    expect(p.data).toEqual({ kind: 'message', channelId: base.channel.id, messageId: 'm1' });
  });

  it('quiet: no sound, passive, the quiet Android channel', () => {
    const p = buildMessagePush({ ...base, settings: { notify_level: 'quiet', notify_sound: 'chime' } })!;
    expect(p.sound).toBeNull();
    expect(p.interruptionLevel).toBe('passive');
    expect(p.priority).toBe('normal');
    expect(p.channelId).toBe(androidChannelId(base.channel.id, 'quiet', 'chime'));
  });

  it('none: nothing — unless the message needs them now', () => {
    expect(buildMessagePush({ ...base, settings: { notify_level: 'none' } })).toBeNull();
    const urgent = buildMessagePush({
      ...base,
      message: { ...base.message, urgent: true },
      settings: { notify_level: 'none', notify_preview: false },
    })!;
    expect(urgent.title).toBe('Needs you now · Logistics');
    expect(urgent.interruptionLevel).toBe('time-sensitive');
    expect(urgent.channelId).toBe(URGENT_ANDROID_CHANNEL);
    // Urgent always says what it is.
    expect(urgent.body).toBe('Did you book the vet?');
  });

  it('respects the preview choice and the chime sound', () => {
    expect(buildMessagePush({ ...base, settings: { notify_preview: false } })!.body).toBe('New message');
    expect(buildMessagePush({ ...base, settings: { notify_sound: 'chime' } })!.sound).toBe(CHIME_SOUND_FILE);
    expect(buildMessagePush({ ...base, settings: { notify_sound: 'none' } })!.sound).toBeNull();
  });

  it('excerpts photos, voice notes and long text', () => {
    expect(messageExcerpt('image', null)).toBe('Photo');
    expect(messageExcerpt('voice', null)).toBe('Voice note');
    const long = messageExcerpt('text', 'word '.repeat(100));
    expect(long.length).toBeLessThanOrEqual(181);
    expect(long.endsWith('…')).toBe(true);
  });

  it('ring pushes target the ring channel and open the room', () => {
    const p = buildRingPush('t', 'Natasha');
    expect(p.channelId).toBe(RING_ANDROID_CHANNEL);
    expect(p.data).toEqual({ kind: 'ring' });
    expect(p.body).toContain('Natasha');
  });
});

describe('Android notification channels follow the app channels', () => {
  const ch = (id: string, name: string, my: Record<string, string>, archived = false): Channel => ({
    id,
    name,
    icon: 'leaf-outline',
    position: 1,
    archived_at: archived ? '2026-11-18T00:00:00Z' : null,
    settings: {},
    my_settings: my,
    last_message_at: null,
    last_message_sender: null,
    last_message_preview: null,
    last_read_at: null,
    unread: false,
    updated_at: '2026-11-18T00:00:00Z',
  });
  const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const b = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const c = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  it('one OS channel per active, not-muted conversation, named like it', () => {
    const desired = desiredAndroidChannels([
      ch(a, 'Everyday', {}),
      ch(b, 'Heart-to-heart', { notify_level: 'quiet' }),
      ch(c, 'Muted', { notify_level: 'none' }),
      ch('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Old', {}, true),
    ]);
    expect(desired).toEqual([
      { id: androidChannelId(a, 'notify', 'default'), name: 'Everyday', quiet: false, sound: 'default' },
      { id: androidChannelId(b, 'quiet', 'default'), name: 'Heart-to-heart', quiet: true, sound: 'default' },
    ]);
  });

  it('removes our stale channels (level or sound changed, muted, archived) and leaves others alone', () => {
    const desired = desiredAndroidChannels([ch(a, 'Everyday', {})]);
    const stale = staleAndroidChannels(
      [desired[0].id, androidChannelId(a, 'quiet', 'default'), URGENT_ANDROID_CHANNEL, 'expo_default', androidChannelId(c, 'notify', 'chime')],
      desired
    );
    expect(stale).toEqual([androidChannelId(a, 'quiet', 'default'), androidChannelId(c, 'notify', 'chime')]);
  });
});
