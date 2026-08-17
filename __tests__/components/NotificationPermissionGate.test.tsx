import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotificationPermissionGate } from '../../components/NotificationPermissionGate';
import {
  getNotificationPermission,
  requestNotificationPermission,
  getExpoPushToken,
} from '../../lib/pushNotifications';

jest.mock('../../lib/pushNotifications', () => ({
  getNotificationPermission: jest.fn(),
  requestNotificationPermission: jest.fn(),
  getExpoPushToken: jest.fn(),
}));

const mockUpdate = jest.fn();
const mockEq = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (...args: unknown[]) => {
        mockUpdate(...args);
        return { eq: (...eqArgs: unknown[]) => mockEq(...eqArgs) };
      },
    }),
  },
}));

const getPermissionMock = getNotificationPermission as jest.MockedFunction<
  typeof getNotificationPermission
>;
const requestPermissionMock = requestNotificationPermission as jest.MockedFunction<
  typeof requestNotificationPermission
>;
const getTokenMock = getExpoPushToken as jest.MockedFunction<
  typeof getExpoPushToken
>;
const getItemMock = AsyncStorage.getItem as jest.Mock;
const setItemMock = AsyncStorage.setItem as jest.Mock;

const EXPLAINER_TEXT =
  'Events notifies you when someone shares an event with you.';
const ANSWERED_KEY = 'notification_explainer_answered';

function renderGate() {
  const screen = render(<NotificationPermissionGate userId="u1" checkKey={0} />);
  const bump = (key: number) =>
    screen.rerender(<NotificationPermissionGate userId="u1" checkKey={key} />);
  return { ...screen, bump };
}

describe('NotificationPermissionGate', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
    getItemMock.mockResolvedValue(null);
    mockEq.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('shows the explainer before requesting permission when undetermined', async () => {
    getPermissionMock.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });

    const screen = renderGate();
    screen.bump(1);

    await waitFor(() => expect(screen.getByText(EXPLAINER_TEXT)).toBeTruthy());
    expect(requestPermissionMock).not.toHaveBeenCalled();
  });

  it('does nothing without a checkKey bump', async () => {
    const screen = renderGate();

    await waitFor(() => expect(screen.queryByText(EXPLAINER_TEXT)).toBeNull());
    expect(getPermissionMock).not.toHaveBeenCalled();
  });

  it('Continue requests permission and registers the token when granted', async () => {
    getPermissionMock.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });
    requestPermissionMock.mockResolvedValue(true);
    getTokenMock.mockResolvedValue('ExponentPushToken[abc]');

    const screen = renderGate();
    screen.bump(1);
    await waitFor(() => expect(screen.getByText('Continue')).toBeTruthy());
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(requestPermissionMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        expo_push_token: 'ExponentPushToken[abc]',
      })
    );
    expect(mockEq).toHaveBeenCalledWith('id', 'u1');
    expect(setItemMock).toHaveBeenCalledWith(ANSWERED_KEY, 'true');
    await waitFor(() => expect(screen.queryByText(EXPLAINER_TEXT)).toBeNull());
  });

  it('Continue on OS deny records the answer without registering a token', async () => {
    getPermissionMock.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });
    requestPermissionMock.mockResolvedValue(false);

    const screen = renderGate();
    screen.bump(1);
    await waitFor(() => expect(screen.getByText('Continue')).toBeTruthy());
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(setItemMock).toHaveBeenCalledWith(ANSWERED_KEY, 'true'));
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(EXPLAINER_TEXT)).toBeNull());
  });

  it('Not now never calls the OS, persists the answer, and does not re-ask', async () => {
    getPermissionMock.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });

    const screen = renderGate();
    screen.bump(1);
    await waitFor(() => expect(screen.getByText('Not now')).toBeTruthy());
    fireEvent.press(screen.getByText('Not now'));

    await waitFor(() => expect(screen.queryByText(EXPLAINER_TEXT)).toBeNull());
    expect(requestPermissionMock).not.toHaveBeenCalled();
    expect(setItemMock).toHaveBeenCalledWith(ANSWERED_KEY, 'true');

    screen.bump(2);
    expect(getPermissionMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(EXPLAINER_TEXT)).toBeNull();
  });

  it('stays hidden when the user already answered on a previous launch', async () => {
    getItemMock.mockResolvedValue('true');

    const screen = renderGate();
    screen.bump(1);

    await waitFor(() => expect(screen.queryByText(EXPLAINER_TEXT)).toBeNull());
    expect(getPermissionMock).not.toHaveBeenCalled();
    expect(requestPermissionMock).not.toHaveBeenCalled();
  });

  it('stays hidden when permission is already granted', async () => {
    getPermissionMock.mockResolvedValue({ status: 'granted', canAskAgain: true });

    const screen = renderGate();
    screen.bump(1);

    await waitFor(() => expect(getPermissionMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(EXPLAINER_TEXT)).toBeNull();
    expect(requestPermissionMock).not.toHaveBeenCalled();
  });

  it('stays hidden when the OS will not ask again (no recovery screen)', async () => {
    getPermissionMock.mockResolvedValue({ status: 'denied', canAskAgain: false });

    const screen = renderGate();
    screen.bump(1);

    await waitFor(() => expect(getPermissionMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(EXPLAINER_TEXT)).toBeNull();
    expect(requestPermissionMock).not.toHaveBeenCalled();
  });

  it('does nothing on web', async () => {
    Platform.OS = 'web';

    const screen = renderGate();
    screen.bump(1);

    await waitFor(() => expect(getPermissionMock).not.toHaveBeenCalled());
    expect(screen.queryByText(EXPLAINER_TEXT)).toBeNull();
  });
});
