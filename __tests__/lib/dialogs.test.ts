import { Alert, Platform } from 'react-native';
import { showAlert, showConfirm } from '../../lib/dialogs';

describe('lib/dialogs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('showAlert', () => {
    it('delegates to Alert.alert on native', () => {
      showAlert('Invalid phone number', 'Please enter a valid phone number.');

      expect(Alert.alert).toHaveBeenCalledWith(
        'Invalid phone number',
        'Please enter a valid phone number.'
      );
    });

    it('uses window.alert on web, where react-native-web Alert.alert is a no-op', () => {
      const originalOS = Platform.OS;
      Platform.OS = 'web';
      const alertMock = jest.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = globalThis as any;
      const hadWindow = typeof g.window !== 'undefined';
      const originalWindow = g.window;
      g.window = { ...(originalWindow ?? {}), alert: alertMock };

      try {
        showAlert('Required', 'Enter a title or URL.');

        expect(alertMock).toHaveBeenCalledTimes(1);
        expect(alertMock.mock.calls[0][0]).toContain('Required');
        expect(alertMock.mock.calls[0][0]).toContain('Enter a title or URL.');
        expect(Alert.alert).not.toHaveBeenCalled();
      } finally {
        Platform.OS = originalOS;
        if (hadWindow) {
          g.window = originalWindow;
        } else {
          delete g.window;
        }
      }
    });
  });

  describe('showConfirm', () => {
    it('delegates to Alert.alert with cancel/confirm buttons on native', () => {
      const onConfirm = jest.fn();
      showConfirm('Remove Event', 'Remove this event?', {
        confirmText: 'Remove',
        destructive: true,
        onConfirm,
      });

      expect(Alert.alert).toHaveBeenCalledWith('Remove Event', 'Remove this event?', [
        { text: 'Cancel', style: 'cancel', onPress: undefined },
        { text: 'Remove', style: 'destructive', onPress: onConfirm },
      ]);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('passes onCancel through to the native cancel button', () => {
      const onCancel = jest.fn();
      showConfirm('Access Your Contacts?', 'Allow access?', {
        confirmText: 'Continue',
        cancelText: 'Add Manually',
        onConfirm: jest.fn(),
        onCancel,
      });

      const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
      const cancelButton = buttons.find((b: { style?: string }) => b.style === 'cancel');
      expect(cancelButton.onPress).toBe(onCancel);
    });

    it('runs onCancel on web when window.confirm is declined', () => {
      const originalOS = Platform.OS;
      Platform.OS = 'web';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = globalThis as any;
      const hadWindow = typeof g.window !== 'undefined';
      const originalWindow = g.window;

      try {
        const confirmMock = jest.fn().mockReturnValue(false);
        g.window = { ...(originalWindow ?? {}), confirm: confirmMock };
        const onConfirm = jest.fn();
        const onCancel = jest.fn();

        showConfirm('Access Your Contacts?', 'Allow access?', {
          confirmText: 'Continue',
          onConfirm,
          onCancel,
        });

        expect(onConfirm).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalledTimes(1);
      } finally {
        Platform.OS = originalOS;
        if (hadWindow) {
          g.window = originalWindow;
        } else {
          delete g.window;
        }
      }
    });

    it('uses window.confirm on web and runs onConfirm only when accepted', () => {
      const originalOS = Platform.OS;
      Platform.OS = 'web';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = globalThis as any;
      const hadWindow = typeof g.window !== 'undefined';
      const originalWindow = g.window;

      try {
        const confirmMock = jest.fn().mockReturnValue(true);
        g.window = { ...(originalWindow ?? {}), confirm: confirmMock };
        const onConfirm = jest.fn();

        showConfirm('Remove Event', 'Remove this event?', { confirmText: 'Remove', onConfirm });

        expect(confirmMock).toHaveBeenCalledTimes(1);
        expect(confirmMock.mock.calls[0][0]).toContain('Remove Event');
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(Alert.alert).not.toHaveBeenCalled();

        confirmMock.mockReturnValue(false);
        const onDeclined = jest.fn();
        showConfirm('Remove Event', 'Remove this event?', { confirmText: 'Remove', onConfirm: onDeclined });
        expect(onDeclined).not.toHaveBeenCalled();
      } finally {
        Platform.OS = originalOS;
        if (hadWindow) {
          g.window = originalWindow;
        } else {
          delete g.window;
        }
      }
    });
  });
});
