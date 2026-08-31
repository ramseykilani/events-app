import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../hooks/useTheme';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// In-app confirm for irreversible actions (Remove Event). OS Alert /
// window.confirm is easy to tap through and does not read as an app pop-up.
export function ConfirmModal({
  visible,
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.root}>
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.shadow, opacity: 0.45 }]}
          pointerEvents="none"
        />
        <View
          style={[styles.card, { backgroundColor: theme.surface }]}
          accessibilityLabel={title}
        >
          <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
          <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
          <TouchableOpacity
            style={[
              styles.button,
              {
                backgroundColor: destructive
                  ? theme.destructiveBg
                  : theme.primaryButtonBg,
              },
            ]}
            onPress={onConfirm}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.buttonText,
                {
                  color: destructive
                    ? theme.destructiveText
                    : theme.primaryButtonText,
                },
              ]}
            >
              {confirmText}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            activeOpacity={0.6}
            accessibilityRole="button"
          >
            <Text style={[styles.cancelText, { color: theme.textSecondary }]}>
              {cancelText}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  cancelButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  cancelText: {
    fontSize: 16,
  },
});
