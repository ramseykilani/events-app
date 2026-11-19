// The notification grammar (FEATURES.md -> Notifications). Pure, so Jest pins
// it and the app shares it: the client creates the Android notification
// channels with the same ids the server targets (lib/notificationChannels.ts
// re-exports these), so the two can never disagree about where a message
// lands.
//
// The design: every notification says, at a glance, that it is your partner
// and what kind of conversation it is. The title is the channel; the body is
// the message (or nothing but "New message" when the reader chose no
// preview). On iOS each channel is its own thread (threadId) with its own
// sound and interruption level; on Android each channel is its own OS
// notification channel, so sound/vibration/importance can be tuned per
// channel in system settings too.

export type NotifyLevel = 'notify' | 'quiet' | 'none';
export type NotifySound = 'default' | 'chime' | 'none';

// Android channel ids encode the importance and sound, because Android fixes
// both when a channel is created and an app cannot change them afterwards. A
// level or sound change in the app therefore means a new OS channel (the
// client deletes the old one); a rename keeps the id.
export function androidChannelId(
  channelId: string,
  level: Exclude<NotifyLevel, 'none'>,
  sound: NotifySound
): string {
  return `ily.${channelId}.${level}.${sound}`;
}

// Fixed OS channels outside the per-conversation ones: "needs you now" and
// rings each get one, created at high importance.
export const URGENT_ANDROID_CHANNEL = 'ily.urgent';
export const RING_ANDROID_CHANNEL = 'ily.ring';

// The interactive category: a Reply text action on both platforms.
export const MESSAGE_CATEGORY = 'ily.message';

// Bundled with the app (app.config.js -> expo-notifications sounds).
export const CHIME_SOUND_FILE = 'chime.wav';

export const PREVIEW_MAX = 180;

export type PushMessage = {
  to: string;
  title: string;
  subtitle?: string;
  body: string;
  data: Record<string, string>;
  sound: string | null;
  priority: 'default' | 'normal' | 'high';
  interruptionLevel: 'active' | 'passive' | 'time-sensitive';
  channelId: string;
  threadId: string;
  categoryId?: string;
};

export type MessagePushInput = {
  token: string;
  channel: { id: string; name: string };
  senderName: string;
  message: { id: string; kind: string; body: string | null; urgent: boolean };
  settings: { notify_level?: unknown; notify_preview?: unknown; notify_sound?: unknown };
};

function asLevel(value: unknown): NotifyLevel {
  return value === 'quiet' || value === 'none' ? value : 'notify';
}

function asSound(value: unknown): NotifySound {
  return value === 'chime' || value === 'none' ? value : 'default';
}

export function messageExcerpt(kind: string, body: string | null): string {
  if (kind === 'image' && !body?.trim()) return 'Photo';
  if (kind === 'voice') return 'Voice note';
  const clean = (body ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= PREVIEW_MAX) return clean;
  const cut = clean.slice(0, PREVIEW_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : PREVIEW_MAX).trimEnd()}…`;
}

function soundValue(sound: NotifySound): string | null {
  if (sound === 'none') return null;
  return sound === 'chime' ? CHIME_SOUND_FILE : 'default';
}

// null = do not notify. The SQL claim already drops 'none' unless urgent;
// this re-checks so the builder is safe on its own.
export function buildMessagePush(input: MessagePushInput): PushMessage | null {
  const level = asLevel(input.settings.notify_level);
  const sound = asSound(input.settings.notify_sound);
  const preview = input.settings.notify_preview !== false;
  const urgent = input.message.urgent;
  if (level === 'none' && !urgent) return null;

  const body = preview ? messageExcerpt(input.message.kind, input.message.body) : 'New message';
  const data = {
    kind: 'message',
    channelId: input.channel.id,
    messageId: input.message.id,
  };

  if (urgent) {
    return {
      to: input.token,
      title: `Needs you now · ${input.channel.name}`,
      subtitle: input.senderName,
      body: messageExcerpt(input.message.kind, input.message.body),
      data,
      sound: 'default',
      priority: 'high',
      interruptionLevel: 'time-sensitive',
      channelId: URGENT_ANDROID_CHANNEL,
      threadId: input.channel.id,
      categoryId: MESSAGE_CATEGORY,
    };
  }

  const quiet = level === 'quiet';
  return {
    to: input.token,
    title: input.channel.name,
    subtitle: input.senderName,
    body,
    data,
    sound: quiet ? null : soundValue(sound),
    priority: quiet ? 'normal' : 'high',
    interruptionLevel: quiet ? 'passive' : 'active',
    channelId: androidChannelId(input.channel.id, quiet ? 'quiet' : 'notify', sound),
    threadId: input.channel.id,
    categoryId: MESSAGE_CATEGORY,
  };
}

export function buildRingPush(token: string, callerName: string): PushMessage {
  return {
    to: token,
    title: 'Your room',
    subtitle: callerName,
    body: `${callerName} is in your room. Tap to join.`,
    data: { kind: 'ring' },
    sound: 'default',
    priority: 'high',
    interruptionLevel: 'time-sensitive',
    channelId: RING_ANDROID_CHANNEL,
    threadId: 'ily.room',
  };
}
