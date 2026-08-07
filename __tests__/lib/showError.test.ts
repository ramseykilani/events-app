import { Alert, Platform } from 'react-native';
import { showError } from '../../lib/showError';

describe('lib/showError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('formats Error instances with code/details/hint and stack', () => {
    const err = new Error('Something broke');
    const rec = err as unknown as Record<string, unknown>;
    rec.code = 'XX01';
    rec.details = 'row violated policy';
    rec.hint = 'check RLS';
    err.stack = 'stack trace';

    showError('Error', err);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      expect.stringContaining('Something broke')
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      expect.stringContaining('Code: XX01')
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      expect.stringContaining('Details: row violated policy')
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      expect.stringContaining('Hint: check RLS')
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      expect.stringContaining('Stack:\nstack trace')
    );
  });

  it('formats plain object errors and includes raw payload', () => {
    const err = {
      message: 'Forbidden',
      code: '403',
      details: 'denied',
      hint: 'login',
    };

    showError('Oops', err);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Oops',
      expect.stringContaining('Forbidden')
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Oops',
      expect.stringContaining('Raw:\n')
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      'Oops',
      expect.stringContaining('"code": "403"')
    );
  });

  it('falls back when no details are available', () => {
    showError('Unknown', undefined);

    expect(Alert.alert).toHaveBeenCalledWith(
      'Unknown',
      'Unknown error (no details available)'
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
    const originalAlert = hadWindow ? g.window.alert : undefined;
    g.window = { ...(originalWindow ?? {}), alert: alertMock };

    try {
      showError('Error', new Error('web failure'));

      expect(alertMock).toHaveBeenCalledTimes(1);
      expect(alertMock.mock.calls[0][0]).toContain('Error');
      expect(alertMock.mock.calls[0][0]).toContain('web failure');
      expect(Alert.alert).not.toHaveBeenCalled();
    } finally {
      Platform.OS = originalOS;
      if (hadWindow) {
        g.window = originalWindow;
        if (originalWindow && typeof originalWindow === 'object') {
          originalWindow.alert = originalAlert;
        }
      } else {
        delete g.window;
      }
    }
  });
});
