import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type ViewStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';

// The pill shape (FEATURES.md → Design System Consolidation): fully rounded,
// surfaceSecondary fill (selectedBg when selected), 14px/600 label, real
// 44pt target. Covers selectable chips (ShareSheet circles) and pill row
// actions (archived Restore).

type Props = {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

export function Chip({
  label,
  onPress,
  selected,
  disabled,
  loading,
  accessibilityLabel,
  style,
}: Props) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        { backgroundColor: selected ? theme.selectedBg : theme.surfaceSecondary },
        disabled && styles.dimmed,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: selected ?? false, disabled: disabled ?? false }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.textSecondary} />
      ) : (
        <Text
          style={[styles.label, { color: disabled ? theme.textTertiary : theme.textPrimary }]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dimmed: {
    opacity: 0.5,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});
