import { StyleSheet, Text, TouchableOpacity, type ViewStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';

// The quiet tier (FEATURES.md → Design System Consolidation): a text action
// with a real 44pt target — the pattern people's textAction pioneered.
// Tones: default for neutral actions (Archive, Hide, Retry), link for
// navigation-ish actions, destructive (the spec's QuietDestructiveLink) for
// Remove/Delete row actions and footer entries. No fontSize overrides.

type Props = {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'link' | 'destructive';
  disabled?: boolean;
  accessibilityLabel?: string;
  // Container override — e.g. alignSelf for row vs centered placement.
  style?: ViewStyle;
};

export function TextAction({
  label,
  onPress,
  tone = 'default',
  disabled,
  accessibilityLabel,
  style,
}: Props) {
  const theme = useTheme();
  const color =
    tone === 'destructive'
      ? theme.destructiveLink
      : tone === 'link'
        ? theme.linkText
        : theme.textSecondary;
  return (
    <TouchableOpacity
      style={[styles.action, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled ?? false }}
    >
      <Text style={[styles.label, { color }, disabled && { color: theme.textTertiary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  action: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    alignSelf: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
