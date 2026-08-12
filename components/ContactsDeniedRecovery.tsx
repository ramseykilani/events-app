import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';

type Props = {
  visible: boolean;
  onOpenSettings: () => void;
  onAddNumber: () => void;
  onClose: () => void;
};

export function ContactsDeniedRecovery({ visible, onOpenSettings, onAddNumber, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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
              styles.title,
              {
                color: theme.textPrimary,
                fontFamily: theme.titleFontFamily,
                fontWeight: theme.titleFontWeight,
              },
            ]}
            accessibilityRole="header"
          >
            Contacts are off
          </Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            Events uses your contacts so you can pick who to text when you share.
          </Text>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primary, { backgroundColor: theme.primaryButtonBg }]}
            onPress={onOpenSettings}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryText, { color: theme.primaryButtonText }]}>Open Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onAddNumber}
            activeOpacity={0.6}
            accessibilityRole="button"
            style={styles.secondary}
          >
            <Text style={[styles.secondaryText, { color: theme.textTertiary }]}>Add a number instead</Text>
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
    gap: 16,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
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
