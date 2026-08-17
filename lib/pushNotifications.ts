import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

export type NotificationPermission = {
  status: string;
  canAskAgain: boolean;
};

/**
 * Full permission snapshot: status plus whether the OS will still show a
 * prompt. Branch: granted → register the token silently; canAskAgain →
 * explainer; otherwise → nothing (SMS covers a denied user).
 */
export async function getNotificationPermission(): Promise<NotificationPermission> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  return { status, canAskAgain };
}

/**
 * Request notification permission. The explainer's Continue is the only
 * caller — nothing else may fire the OS prompt (iOS gives the app one ask,
 * and a cold ask burns it before the user knows what the ping is for).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Get the Expo push token when permission is already granted. Never requests
 * permission — the explainer owns the ask. Web users get SMS, not browser
 * push, so this never triggers the browser's notification prompt.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  return token.data;
}
