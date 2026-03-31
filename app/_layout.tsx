import { useEffect, useRef } from 'react';
import { LogBox, Platform, StatusBar, useColorScheme } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { SessionContextProvider, useSession } from './_context/SessionContext';
import { supabase } from '../lib/supabase';

LogBox.ignoreLogs(['unable to keep activate awake']);

// Show notifications when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  return token.data;
}

function RootLayoutNav() {
  const { session, isLoading } = useSession();
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const router = useRouter();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && !inAppGroup) {
      router.replace('/(app)');
    }
  }, [session, isLoading, segments]);

  // Register for push notifications when the user is authenticated
  useEffect(() => {
    if (!session?.user?.id) return;

    registerForPushNotifications()
      .then((token) => {
        if (!token) return;
        supabase
          .from('users')
          .update({ expo_push_token: token })
          .eq('id', session.user.id)
          .then(({ error }) => {
            if (error) console.error('Failed to save push token:', error);
          });
      })
      .catch((err) => console.error('Push registration error:', err));
  }, [session?.user?.id]);

  // Navigate to the event when a notification is tapped
  useEffect(() => {
    notificationListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const eventId = response.notification.request.content.data?.eventId as
          | string
          | undefined;
        if (eventId) {
          router.push({
            pathname: '/(app)/event/[id]',
            params: { id: eventId },
          });
        }
      });

    return () => {
      notificationListener.current?.remove();
    };
  }, [router]);

  if (isLoading) {
    return null;
  }

  return (
    <>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SessionContextProvider>
      <RootLayoutNav />
    </SessionContextProvider>
  );
}
