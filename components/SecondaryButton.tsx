import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../hooks/useTheme';

// The second tier (FEATURES.md → Design System Consolidation): same geometry
// as PrimaryButton, surfaceSecondary fill — visibly subordinate to the one
// primary action per view. No fontSize/borderRadius overrides.

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  size?: 'default' | 'compact';
  testID?: string;
};

export function SecondaryButton({
  label,
  onPress,
  disabled,
  loading,
  accessibilityLabel,
  size = 'default',
  testID,
}: Props) {
  const theme = useTheme();
  const inactive = (disabled ?? false) || (loading ?? false);
  return (
    <TouchableOpacity
      style={[
        styles.button,
        size === 'compact' && styles.compact,
        { backgroundColor: theme.surfaceSecondary },
        inactive && styles.dimmed,
      ]}
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy: loading ?? false }}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={theme.textPrimary} />
      ) : (
        <Text style={[styles.label, { color: theme.textPrimary }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  dimmed: {
    opacity: 0.6,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
