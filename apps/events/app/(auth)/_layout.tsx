import { Stack } from 'expo-router';
import { useTheme } from '@family/design';
import { themedScreenOptions } from '@family/design';

export default function AuthLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={themedScreenOptions(theme)}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="verify" />
    </Stack>
  );
}
