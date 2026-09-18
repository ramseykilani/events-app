import { useEffect, useRef } from 'react';
import { ActivityIndicator, LogBox, StatusBar, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { ThemeProvider } from '@react-navigation/native';
import { SessionContextProvider, useSession } from './_context/SessionContext';
import { ThemeContextProvider, useThemePreference } from './_context/ThemeContext';
import { supabase } from '../lib/supabase';
import { getExpoPushToken } from '../lib/pushNotifications';
import { navigationTheme, themedScreenOptions } from '../lib/navigationTheme';

LogBox.ignoreLogs(['unable to keep activate awake']);

// Show notifications when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function RootLayoutNav() {
  const { session, isLoading } = useSession();
  const { theme, isLoaded: themeLoaded } = useThemePreference();
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

  // Register for push notifications when the user is authenticated. Never
  // prompts: the notification explainer owns the OS ask — here we only pick
  // up the token when permission is already granted.
  useEffect(() => {
    if (!session?.user?.id) return;

    getExpoPushToken()
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

  // Hold the loading screen until the stored theme is read so Evening users
  // never see a flash of Paper on launch.
  if (isLoading || !themeLoaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={theme.textPrimary} />
      </View>
    );
  }

  return (
    <ThemeProvider value={navigationTheme(theme)}>
      <StatusBar barStyle={theme.statusBar} />
      <Stack screenOptions={themedScreenOptions(theme)}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeContextProvider>
      <SessionContextProvider>
        <RootLayoutNav />
      </SessionContextProvider>
    </ThemeContextProvider>
  );
}
