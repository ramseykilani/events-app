import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

// The one header grammar (FEATURES.md → Design System Consolidation; audit
// UX-01/02/03). The bar and every action carry a real minHeight: 44 — visible
// targets, never hitSlop-only. Fixed left-control vocabulary: chevron +
// destination label for navigation, Cancel for abandoning edits, Close for
// dismissing sheets, Done after a completed send. Replaces the four header
// grammars screens invented for themselves.

export type AppHeaderLeft =
  | { kind: 'back'; label: string }
  | { kind: 'cancel' }
  | { kind: 'close' }
  | { kind: 'done' };

type Props = {
  // Optional: screens whose content is itself the headline (event detail's
  // ceremonial title) run the bar with no title.
  title?: string;
  left: AppHeaderLeft;
  onLeft: () => void;
  right?: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  };
  // Rare: one icon control (e.g. People's settings gear) sitting left of the
  // right text action. The text action stays the primary.
  rightAccessory?: ReactNode;
};

const LEFT_LABELS = { cancel: 'Cancel', close: 'Close', done: 'Done' } as const;

export function AppHeader({ title, left, onLeft, right, rightAccessory }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.bar, { borderBottomColor: theme.borderLight }]}>
      {left.kind === 'back' ? (
        <TouchableOpacity
          style={styles.action}
          onPress={onLeft}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${left.label}`}
        >
          <Ionicons name="chevron-back" size={18} color={theme.textSecondary} />
          <Text style={[styles.leftText, { color: theme.textSecondary }]}>{left.label}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.action}
          onPress={onLeft}
          activeOpacity={0.6}
          accessibilityRole="button"
        >
          <Text style={[styles.leftText, { color: theme.textSecondary }]}>
            {LEFT_LABELS[left.kind]}
          </Text>
        </TouchableOpacity>
      )}
      {title ? (
        // Absolutely centered so unequal side widths can't drift the title
        // off-center (the old space-between headers did). Touches pass
        // through to the actions.
        <View style={styles.titleWrap} pointerEvents="none">
          <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      ) : null}
      {right || rightAccessory ? (
        <View style={styles.rightCluster}>
          {rightAccessory}
          {right ? (
            <TouchableOpacity
              style={styles.action}
              onPress={right.onPress}
              disabled={right.disabled}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityState={{ disabled: right.disabled ?? false }}
            >
              <Text
                style={[
                  styles.rightText,
                  { color: theme.textPrimary },
                  right.disabled && { color: theme.textTertiary },
                ]}
              >
                {right.label}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    minHeight: 44,
  },
  action: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  leftText: {
    fontSize: 16,
  },
  titleWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    // Keep a long title clear of the side actions.
    paddingHorizontal: 96,
    paddingBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  rightText: {
    fontSize: 16,
    fontWeight: '600',
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
