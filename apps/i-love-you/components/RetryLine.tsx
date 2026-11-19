import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '@family/design';

// The one retry grammar (Events audit UX-17/23): a quiet banner over content
// that stays on screen, linkText — red is consequence, not information.
export function RetryLine({ label = 'Could not refresh. Retry', onPress }: { label?: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: theme.surface }]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
    >
      <Text style={[styles.text, { color: theme.linkText }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 14 },
});
