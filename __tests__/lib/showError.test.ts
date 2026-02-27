import { Alert } from 'react-native';
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
    (err as Record<string, unknown>).code = 'XX01';
    (err as Record<string, unknown>).details = 'row violated policy';
    (err as Record<string, unknown>).hint = 'check RLS';
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
});
