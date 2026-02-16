import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SessionContextProvider, useSession } from './context/SessionContext';

function RootLayoutNav() {
  const { session, isLoading } = useSession();
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

  if (isLoading) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionContextProvider>
      <RootLayoutNav />
    </SessionContextProvider>
  );
}
