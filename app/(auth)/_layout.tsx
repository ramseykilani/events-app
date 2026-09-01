import { Stack } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { themedScreenOptions } from '../../lib/navigationTheme';

export default function AuthLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={themedScreenOptions(theme)}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="verify" />
    </Stack>
  );
}
