import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import type { Channel, Message } from './types';
import {
  CHIME_SOUND_FILE,
  MESSAGE_CATEGORY,
  RING_ANDROID_CHANNEL,
  URGENT_ANDROID_CHANNEL,
  desiredAndroidChannels,
  staleAndroidChannels,
} from './notificationChannels';

// Phone half of notifications (FEATURES.md -> Notifications). Push comes
// from the send-push edge function; this module owns the device side:
//   - Android: one OS notification channel per conversation, created,
//     renamed and removed in step with the app's channels, so sound,
//     vibration and importance can be tuned per channel in system settings.
//   - iOS: the server sets threadId per channel (grouping), the sound and the
//     interruption level (passive for quiet, time-sensitive for "needs you
//     now") from the reader's per-channel settings.
//   - A Reply action on message notifications (both platforms).
//   - Foreground: a message for the channel already on screen is not shown.
//
// The OS permission prompt has exactly one call site: requestPermission()
// (Settings -> Notifications, and the one-time card after pairing).

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

type Handlers = {
  openChannel: (channelId: string) => void;
  reply: (channelId: string, text: string, replyToId: string | null) => Promise<void>;
  openRoom: () => void;
};

let activeChannelId: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as { channelId?: string } | undefined;
    const onScreen = !!data?.channelId && data.channelId === activeChannelId;
    return {
      shouldShowAlert: !onScreen,
      shouldShowBanner: !onScreen,
      shouldShowList: !onScreen,
      shouldPlaySound: !onScreen,
      shouldSetBadge: false,
    };
  },
});

export function setActiveChannel(channelId: string | null): void {
  activeChannelId = channelId;
}

export async function getPermission(): Promise<PermissionState> {
  if (!Device.isDevice) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

export async function requestPermission(): Promise<PermissionState> {
  if (!Device.isDevice) return 'unsupported';
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

// Never prompts: returns a token only when permission is already granted.
export async function registerPushToken(): Promise<string | null> {
  if ((await getPermission()) !== 'granted') return null;
  await configureCategories();
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('No EAS projectId: push tokens need `eas init` (SETUP.md -> EAS).');
    return null;
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

async function configureCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(MESSAGE_CATEGORY, [
    {
      identifier: 'reply',
      buttonTitle: 'Reply',
      textInput: { submitButtonTitle: 'Send', placeholder: 'Reply' },
      // Reply without opening the app where the OS allows it.
      options: { opensAppToForeground: false },
    },
  ]);
}

export async function syncNotificationChannels(channels: Channel[]): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelGroupAsync('ily.conversations', { name: 'Conversations' });
    await Notifications.setNotificationChannelAsync(URGENT_ANDROID_CHANNEL, {
      name: 'Needs you now',
      description: 'Messages your partner flagged as needing you now.',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 300, 150, 300, 150, 300],
    });
    await Notifications.setNotificationChannelAsync(RING_ANDROID_CHANNEL, {
      name: 'Your room',
      description: 'When your partner is in your room and asks you to join.',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 400, 200, 400],
    });
    const desired = desiredAndroidChannels(channels);
    for (const spec of desired) {
      // Re-setting an existing id updates its name (a rename); importance and
      // sound are fixed by Android at creation, which is why they are part of
      // the id.
      await Notifications.setNotificationChannelAsync(spec.id, {
        name: spec.name,
        groupId: 'ily.conversations',
        description: `Messages in ${spec.name}`,
        importance: spec.quiet ? Notifications.AndroidImportance.LOW : Notifications.AndroidImportance.HIGH,
        sound: spec.quiet || spec.sound === 'none' ? null : spec.sound === 'chime' ? CHIME_SOUND_FILE : 'default',
        enableVibrate: !spec.quiet,
        vibrationPattern: spec.quiet ? null : [0, 180, 100, 180],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }
    const existing = (await Notifications.getNotificationChannelsAsync()).map((c) => c.id);
    for (const id of staleAndroidChannels(existing, desired)) {
      await Notifications.deleteNotificationChannelAsync(id);
    }
  } catch (err) {
    console.error('notification channel sync failed:', err);
  }
}

export function setupResponseHandling(handlers: Handlers): () => void {
  const handle = (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data as
      | { kind?: string; channelId?: string; messageId?: string }
      | undefined;
    if (data?.kind === 'ring') {
      handlers.openRoom();
      return;
    }
    if (!data?.channelId) return;
    if (response.actionIdentifier === 'reply' && response.userText?.trim()) {
      handlers
        .reply(data.channelId, response.userText.trim(), data.messageId ?? null)
        .then(() => Notifications.dismissNotificationAsync(response.notification.request.identifier))
        .catch((err) => console.error('reply from notification failed:', err));
      return;
    }
    handlers.openChannel(data.channelId);
  };
  // A tap that launched the app from killed.
  Notifications.getLastNotificationResponseAsync()
    .then((r) => r && handle(r))
    .catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

// Phones get the server's push; nothing to present locally.
export function presentIncoming(_message: Message, _channel: Channel | undefined, _partnerName: string): void {}
