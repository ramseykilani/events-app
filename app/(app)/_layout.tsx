import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="add-event" />
      <Stack.Screen name="share" />
      <Stack.Screen name="event/[id]" />
      <Stack.Screen name="edit-event" />
      <Stack.Screen name="people" />
    </Stack>
  );
}
