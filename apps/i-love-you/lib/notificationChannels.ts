// The notification grammar shared with the send-push edge function — one
// definition, so the Android channel ids the app creates are the ids the
// server targets (FEATURES.md -> Notifications).
export {
  androidChannelId,
  buildMessagePush,
  CHIME_SOUND_FILE,
  MESSAGE_CATEGORY,
  messageExcerpt,
  RING_ANDROID_CHANNEL,
  URGENT_ANDROID_CHANNEL,
  type NotifyLevel,
  type NotifySound,
} from '../supabase/functions/_shared/notificationPayload';

import { androidChannelId, type NotifySound } from '../supabase/functions/_shared/notificationPayload';
import { notifyLevel, settingValue } from './channelSettings';
import type { Channel } from './types';

export type AndroidChannelSpec = {
  id: string;
  name: string;
  quiet: boolean;
  sound: NotifySound;
};

// The OS channels this device should have for a channel list: one per
// active, not-muted conversation (named like it, so system settings read
// "Logistics", "Heart-to-heart"). Muted and archived channels have none.
export function desiredAndroidChannels(channels: Channel[]): AndroidChannelSpec[] {
  return channels
    .filter((c) => !c.archived_at && notifyLevel(c) !== 'none')
    .map((c) => {
      const level = notifyLevel(c) === 'quiet' ? 'quiet' : 'notify';
      const sound = settingValue(c, 'notify_sound') as NotifySound;
      return { id: androidChannelId(c.id, level, sound), name: c.name, quiet: level === 'quiet', sound };
    });
}

// OS channels to delete: ours (ily.<uuid>.…), not wanted any more. The fixed
// urgent/ring channels and anything not ours are left alone.
export function staleAndroidChannels(existingIds: string[], desired: AndroidChannelSpec[]): string[] {
  const keep = new Set(desired.map((d) => d.id));
  return existingIds.filter((id) => /^ily\.[0-9a-f-]{36}\./.test(id) && !keep.has(id));
}
