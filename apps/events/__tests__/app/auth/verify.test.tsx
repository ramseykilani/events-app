import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import VerifyScreen from '../../../app/(auth)/verify';

const mockVerifyOtp = jest.fn();
const mockSignInWithOtp = jest.fn();
const mockShowError = jest.fn();

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
    },
  },
}));

jest.mock('../../../lib/showError', () => ({
  showError: (...args: unknown[]) => mockShowError(...args),
}));

describe('app/(auth)/verify', () => {
  const useLocalSearchParamsMock = useLocalSearchParams as jest.MockedFunction<
    typeof useLocalSearchParams
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    useLocalSearchParamsMock.mockReturnValue({});
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('redirects back to sign-in when phone param is missing', async () => {
    render(<VerifyScreen />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/(auth)/sign-in');
    });
  });

  it('shows alert when verify is attempted with empty code', () => {
    useLocalSearchParamsMock.mockReturnValue({ phone: '+14165550001' });
    const screen = render(<VerifyScreen />);

    fireEvent.press(screen.getByTestId('verify-button'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Enter code',
      'Please enter the verification code.'
    );
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('submits trimmed OTP codes', async () => {
    useLocalSearchParamsMock.mockReturnValue({ phone: '+14165550001' });
    mockVerifyOtp.mockResolvedValueOnce({ error: null });

    const screen = render(<VerifyScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('000000'), ' 123456 ');
    fireEvent.press(screen.getByTestId('verify-button'));

    await waitFor(() => {
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        phone: '+14165550001',
        token: '123456',
        type: 'sms',
      });
    });
  });

  it('starts resend cooldown when arriving from a fresh send', () => {
    useLocalSearchParamsMock.mockReturnValue({ phone: '+14165550001', sent: '1' });
    const screen = render(<VerifyScreen />);

    expect(screen.getByText('Resend code in 60s')).toBeTruthy();
    expect(screen.queryByText("Didn't receive it? Try again")).toBeNull();
  });

  it('shows a friendly alert for expired or invalid OTP codes', async () => {
    useLocalSearchParamsMock.mockReturnValue({ phone: '+14165550001' });
    mockVerifyOtp.mockResolvedValueOnce({
      error: {
        message: 'Token has expired or is invalid',
        code: 'otp_expired',
      },
    });

    const screen = render(<VerifyScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('000000'), '111111');
    fireEvent.press(screen.getByTestId('verify-button'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Verification failed',
        expect.stringMatching(/incorrect or no longer valid/i)
      );
    });
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('falls back to showError for unexpected verify failures', async () => {
    useLocalSearchParamsMock.mockReturnValue({ phone: '+14165550001' });
    mockVerifyOtp.mockResolvedValueOnce({
      error: { message: 'database connection refused' },
    });

    const screen = render(<VerifyScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('000000'), '123456');
    fireEvent.press(screen.getByTestId('verify-button'));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Verification failed', {
        message: 'database connection refused',
      });
    });
  });

  it('resends OTP with cooldown messaging', async () => {
    jest.useFakeTimers();
    useLocalSearchParamsMock.mockReturnValue({ phone: '+14165550001' });
    mockSignInWithOtp.mockResolvedValueOnce({ error: null });

    const screen = render(<VerifyScreen />);
    fireEvent.press(screen.getByText("Didn't receive it? Try again"));

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith({ phone: '+14165550001' });
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Code sent',
      'A new verification code has been sent to your phone.'
    );
    expect(screen.getByText('Resend code in 60s')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1100);
    });
    await waitFor(() => expect(screen.getByText('Resend code in 59s')).toBeTruthy());
  });

  it('offers a wrong-number exit back to sign-in (UX-04)', () => {
    useLocalSearchParamsMock.mockReturnValue({ phone: '+14165550001' });

    const screen = render(<VerifyScreen />);
    // The subtitle renders the number formatted, never raw E.164 (UX-27).
    expect(screen.getByText(/\(416\) 555-0001/)).toBeTruthy();

    fireEvent.press(screen.getByText('Wrong number?'));
    expect(router.replace).toHaveBeenCalledWith('/(auth)/sign-in');
  });
});
