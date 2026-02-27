import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import SignInScreen from '../../../app/(auth)/sign-in';

const signInWithOtpMock = jest.fn();
const showErrorMock = jest.fn();

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtpMock(...args),
    },
  },
}));

jest.mock('../../../lib/showError', () => ({
  showError: (...args: unknown[]) => showErrorMock(...args),
}));

describe('app/(auth)/sign-in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows validation alert for invalid phone numbers', () => {
    const screen = render(<SignInScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('+1 (555) 123-4567'), 'abc');
    fireEvent.press(screen.getByText('Send code'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Invalid phone number',
      'Please enter a valid phone number.'
    );
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it('normalizes phone number and navigates to verify on success', async () => {
    signInWithOtpMock.mockResolvedValueOnce({ error: null });
    const screen = render(<SignInScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('+1 (555) 123-4567'), '416-555-1234');
    fireEvent.press(screen.getByText('Send code'));

    await waitFor(() => {
      expect(signInWithOtpMock).toHaveBeenCalledWith({
        phone: '+14165551234',
      });
    });

    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/(auth)/verify',
      params: { phone: '+14165551234' },
    });
  });

  it('surfaces OTP request failures via showError', async () => {
    signInWithOtpMock.mockResolvedValueOnce({
      error: { message: 'sms_send_failed' },
    });

    const screen = render(<SignInScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('+1 (555) 123-4567'), '4165551234');
    fireEvent.press(screen.getByText('Send code'));

    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalledWith('Error', {
        message: 'sms_send_failed',
      });
    });
  });
});
