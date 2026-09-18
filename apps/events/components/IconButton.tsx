import { StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../hooks/useTheme';

// The 44×44 icon-button shape (FEATURES.md → Design System Consolidation) —
// surfaceSecondary fill, radius 10. The glyph(s) are the caller's
// (@expo/vector-icons tinted by role tokens); the accessible name is required
// because there is no visible label.

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  style?: ViewStyle;
};

export function IconButton({ onPress, accessibilityLabel, children, disabled, style }: Props) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: theme.surfaceSecondary }, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled ?? false }}
    >
      {children}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
