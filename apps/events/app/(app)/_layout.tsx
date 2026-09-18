import { Stack } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { themedScreenOptions } from '../../lib/navigationTheme';

export default function AppLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={themedScreenOptions(theme)}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="add-event" />
      <Stack.Screen name="share" />
      <Stack.Screen name="event/[id]" />
      <Stack.Screen name="edit-event" />
      <Stack.Screen name="people" />
    </Stack>
  );
}
