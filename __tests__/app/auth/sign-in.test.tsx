import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import SignInScreen from '../../../app/(auth)/sign-in';

const mockSignInWithOtp = jest.fn();
const mockShowError = jest.fn();

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
    },
  },
}));

jest.mock('../../../lib/showError', () => ({
  showError: (...args: unknown[]) => mockShowError(...args),
}));

describe('app/(auth)/sign-in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows orientation copy for what the app is and why the phone number', () => {
    const screen = render(<SignInScreen />);

    expect(
      screen.getByText(
        'Found something you want to go to? Add it here and share it with the right people — instead of texting them one by one.'
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        'When your people share something, it shows up on your calendar too.'
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Your phone number is your account. We'll text a code to sign in, and it's how you send events to your people."
      )
    ).toBeTruthy();
    expect(screen.queryByText('Enter your phone number to continue')).toBeNull();
  });

  it('shows validation alert for invalid phone numbers', () => {
    const screen = render(<SignInScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('+1 (555) 123-4567'), 'abc');
    fireEvent.press(screen.getByText('Send code'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Invalid phone number',
      'Please enter a valid phone number.'
    );
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('rejects incomplete numeric stubs before they reach the SMS provider', () => {
    const screen = render(<SignInScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('+1 (555) 123-4567'), '123');
    fireEvent.press(screen.getByText('Send code'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Invalid phone number',
      'Please enter a valid phone number.'
    );
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('normalizes phone number and navigates to verify on success', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ error: null });
    const screen = render(<SignInScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('+1 (555) 123-4567'), '416-555-1234');
    fireEvent.press(screen.getByText('Send code'));

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith({
        phone: '+14165551234',
      });
    });

    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/(auth)/verify',
      params: { phone: '+14165551234', sent: '1' },
    });
  });

  it('shows a friendly alert for expected OTP send failures', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({
      error: { message: 'sms_send_failed' },
    });

    const screen = render(<SignInScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('+1 (555) 123-4567'), '4165551234');
    fireEvent.press(screen.getByText('Send code'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not send code',
        expect.stringMatching(/could not send a verification code/i)
      );
    });
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('surfaces unexpected OTP request failures via showError', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({
      error: { message: 'database connection refused' },
    });

    const screen = render(<SignInScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('+1 (555) 123-4567'), '4165551234');
    fireEvent.press(screen.getByText('Send code'));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Error', {
        message: 'database connection refused',
      });
    });
  });

  it('ignores a second Send code tap while the first request is in flight', async () => {
    let resolveRequest: ((value: { error: null }) => void) | undefined;
    mockSignInWithOtp.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    const screen = render(<SignInScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('+1 (555) 123-4567'), '4165551234');
    fireEvent.press(screen.getByText('Send code'));
    fireEvent.press(screen.getByText('Sending...'));

    expect(mockSignInWithOtp).toHaveBeenCalledTimes(1);

    resolveRequest?.({ error: null });
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalled();
    });
  });
});
