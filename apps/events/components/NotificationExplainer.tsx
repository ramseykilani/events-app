import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';

type Props = {
  visible: boolean;
  continuing?: boolean;
  onContinue: () => void;
  onNotNow: () => void;
};

export function NotificationExplainer({ visible, continuing = false, onContinue, onNotNow }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onNotNow}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.background,
            paddingTop: insets.top + 56,
            paddingBottom: Math.max(insets.bottom, 16) + 20,
          },
        ]}
      >
        <View style={styles.content}>
          <Text
            style={[
              styles.body,
              {
                color: theme.textPrimary,
                fontFamily: theme.titleFontFamily,
                fontWeight: theme.titleFontWeight,
              },
            ]}
            accessibilityRole="header"
          >
            Events notifies you when someone shares an event with you.
          </Text>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primary, { backgroundColor: theme.primaryButtonBg }]}
            onPress={onContinue}
            disabled={continuing}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ disabled: continuing }}
          >
            <Text style={[styles.primaryText, { color: theme.primaryButtonText }]}>
              {continuing ? 'Turn on notifications...' : 'Turn on notifications'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onNotNow}
            disabled={continuing}
            activeOpacity={0.6}
            accessibilityRole="button"
            style={styles.secondary}
          >
            <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  content: {
    maxWidth: 420,
  },
  body: {
    fontSize: 28,
    lineHeight: 34,
  },
  footer: {
    gap: 12,
  },
  primary: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '600',
  },
  secondary: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 16,
  },
});
