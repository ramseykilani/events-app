import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../hooks/useTheme';

// The one high-emphasis action per view (FEATURES.md → Design System
// Consolidation; audit UX-05): primaryButtonBg fill, 16px/600 label assigned
// to the design language's §4 Body rung, radius 12, minHeight 48. The tier
// accepts no fontSize/borderRadius overrides — the tier is the grammar.

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  // The working phase is visible (design-language §6): the label swaps to a
  // spinner while the write is in flight.
  loading?: boolean;
  accessibilityLabel?: string;
  // compact is for inline row submits (a name gate, a new-circle row) — same
  // rung and radius, smaller target. fontSize/borderRadius stay unoverridable.
  size?: 'default' | 'compact';
  testID?: string;
};

export function PrimaryButton({
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
        { backgroundColor: theme.primaryButtonBg },
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
        <ActivityIndicator color={theme.primaryButtonText} />
      ) : (
        <Text style={[styles.label, { color: theme.primaryButtonText }]}>{label}</Text>
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
