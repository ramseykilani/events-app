import { Alert, Platform } from 'react-native';

// react-native-web's Alert.alert is a no-op, so validation messages and
// confirmation dialogs would be invisible in the browser. These helpers keep
// the native Alert API on iOS/Android and fall back to window.alert /
// window.confirm on web.

const canUseWebDialogs = (): boolean =>
  Platform.OS === 'web' && typeof window !== 'undefined';

type ConfirmOptions = {
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

export function showAlert(title: string, message: string): void {
  if (canUseWebDialogs() && typeof window.alert === 'function') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export function showConfirm(
  title: string,
  message: string,
  { confirmText = 'OK', cancelText = 'Cancel', destructive = false, onConfirm }: ConfirmOptions
): void {
  if (canUseWebDialogs() && typeof window.confirm === 'function') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: cancelText, style: 'cancel' },
    {
      text: confirmText,
      style: destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
}
