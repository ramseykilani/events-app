import { useEffect } from 'react';
import { ActivityIndicator, LogBox, StatusBar, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ThemeProvider } from '@react-navigation/native';
import { SessionContextProvider, useSession } from './_context/SessionContext';
import { ThemeContextProvider, navigationTheme, themedScreenOptions, useThemePreference } from '@family/design';

LogBox.ignoreLogs(['unable to keep activate awake']);

// Same root as Events: theme + session providers, and the auth/app group
// switch. Everything that needs a signed-in person (the chat engine, the
// call room, push registration) lives in app/(app)/_layout.tsx.
function RootLayoutNav() {
  const { session, isLoading } = useSession();
  const { theme, isLoaded: themeLoaded } = useThemePreference();
  const segments = useSegments();
  const router = useRouter();

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
