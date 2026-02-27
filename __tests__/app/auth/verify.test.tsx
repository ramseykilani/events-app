import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import VerifyScreen from '../../../app/(auth)/verify';

const verifyOtpMock = jest.fn();
const signInWithOtpMock = jest.fn();
const showErrorMock = jest.fn();

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: (...args: unknown[]) => verifyOtpMock(...args),
      signInWithOtp: (...args: unknown[]) => signInWithOtpMock(...args),
    },
  },
}));

jest.mock('../../../lib/showError', () => ({
  showError: (...args: unknown[]) => showErrorMock(...args),
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

    fireEvent.press(screen.getByText('Verify'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Enter code',
      'Please enter the verification code.'
    );
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it('submits trimmed OTP codes', async () => {
    useLocalSearchParamsMock.mockReturnValue({ phone: '+14165550001' });
    verifyOtpMock.mockResolvedValueOnce({ error: null });

    const screen = render(<VerifyScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('000000'), ' 123456 ');
    fireEvent.press(screen.getByText('Verify'));

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith({
        phone: '+14165550001',
        token: '123456',
        type: 'sms',
      });
    });
  });

  it('resends OTP with cooldown messaging', async () => {
    jest.useFakeTimers();
    useLocalSearchParamsMock.mockReturnValue({ phone: '+14165550001' });
    signInWithOtpMock.mockResolvedValueOnce({ error: null });

    const screen = render(<VerifyScreen />);
    fireEvent.press(screen.getByText("Didn't receive it? Try again"));

    await waitFor(() => {
      expect(signInWithOtpMock).toHaveBeenCalledWith({ phone: '+14165550001' });
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Code sent',
      'A new verification code has been sent to your phone.'
    );
    expect(screen.getByText('Resend code in 60s')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText('Resend code in 59s')).toBeTruthy();
  });
});
