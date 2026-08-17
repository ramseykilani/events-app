import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { abortablePromise } from '../../helpers/abortable';
import CalendarScreen from '../../../app/(app)/index';

const mockRpc = jest.fn();

jest.mock('../../../app/_context/SessionContext', () => ({
  useSession: () => ({
    session: {
      user: { id: 'u1' },
    },
  }),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

jest.mock('../../../components/Calendar', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');

  return {
    Calendar: ({
      events,
      onMonthChange,
      onRefresh,
    }: {
      events: { title: string | null }[];
      onMonthChange: (start: string, end: string) => void;
      onRefresh?: () => void;
    }) => (
      <View>
        <Text testID="events-count">{events.length}</Text>
        {events[0]?.title ? <Text>{events[0].title}</Text> : null}
        <TouchableOpacity
          testID="trigger-month"
          onPress={() => onMonthChange('2026-04-01', '2026-04-30')}
        >
          <Text>trigger-month</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="trigger-refresh" onPress={onRefresh}>
          <Text>trigger-refresh</Text>
        </TouchableOpacity>
      </View>
    ),
  };
});

const mockGate = jest.fn();
jest.mock('../../../components/NotificationPermissionGate', () => ({
  NotificationPermissionGate: (props: { userId: string; checkKey: number }) => {
    mockGate(props);
    return null;
  },
}));

const gateCheckKeys = () => mockGate.mock.calls.map((c) => c[0].checkKey as number);

const sampleRow = {
  id: 'ce-1',
  event_id: 'e-1',
  title: 'Spring Concert',
  description: null,
  image_url: null,
  url: null,
  event_date: '2026-04-20',
  event_time: null,
  sharer_contact_name: 'Alice',
  sharer_person_id: 'mp-1',
  sharer_user_id: 'u2',
};

describe('app/(app)/index', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
  });

  it('fetches events for selected month via a single RPC and refreshes using last range', async () => {
    mockRpc.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [sampleRow], error: null }))
    );

    const screen = render(<CalendarScreen />);
    fireEvent.press(screen.getByTestId('trigger-month'));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('get_calendar_events', {
        p_user_id: 'u1',
        p_start_date: '2026-04-01',
        p_end_date: '2026-04-30',
      });
    });

    expect(screen.getByText('Spring Concert')).toBeTruthy();

    fireEvent.press(screen.getByTestId('trigger-refresh'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));
  });

  it('shows the walkthrough once when the user has no events at all', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    mockRpc.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );

    const screen = render(<CalendarScreen />);
    fireEvent.press(screen.getByTestId('trigger-month'));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/(app)/onboarding');
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('onboarding_complete', 'true');
    // Month fetch + wide-range check
    expect(mockRpc).toHaveBeenCalledTimes(2);
    // The notification gate must not trigger while the walkthrough takes over.
    expect(mockGate).toHaveBeenCalled();
    expect(gateCheckKeys().every((k) => k === 0)).toBe(true);
  });

  it('does not show the walkthrough when events exist outside the current month', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    mockRpc
      .mockImplementationOnce(() =>
        abortablePromise(Promise.resolve({ data: [], error: null }))
      )
      .mockImplementationOnce(() =>
        abortablePromise(Promise.resolve({ data: [sampleRow], error: null }))
      );

    const screen = render(<CalendarScreen />);
    fireEvent.press(screen.getByTestId('trigger-month'));

    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));
    expect(router.push).not.toHaveBeenCalledWith('/(app)/onboarding');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('does not show the walkthrough when it was already completed', async () => {
    mockRpc.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );

    const screen = render(<CalendarScreen />);
    fireEvent.press(screen.getByTestId('trigger-month'));

    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
    expect(router.push).not.toHaveBeenCalledWith('/(app)/onboarding');
    // Walkthrough already done — the notification gate gets its check.
    await waitFor(() => expect(gateCheckKeys()).toContain(1));
  });

  it('does not show the walkthrough while the current month has events', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    mockRpc.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [sampleRow], error: null }))
    );

    const screen = render(<CalendarScreen />);
    fireEvent.press(screen.getByTestId('trigger-month'));

    await waitFor(() => expect(screen.getByText('Spring Concert')).toBeTruthy());
    expect(router.push).not.toHaveBeenCalledWith('/(app)/onboarding');
    expect(mockRpc).toHaveBeenCalledTimes(1);
    // Events on screen, no walkthrough — the notification gate gets its check.
    await waitFor(() => expect(gateCheckKeys()).toContain(1));
  });

  it('shows an error banner on RPC failure and retries on tap', async () => {
    mockRpc.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: null, error: { message: 'boom' } }))
    );

    const screen = render(<CalendarScreen />);
    fireEvent.press(screen.getByTestId('trigger-month'));

    const banner = await screen.findByText('Could not load events. Tap to retry.');

    mockRpc.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [sampleRow], error: null }))
    );
    fireEvent.press(banner);

    await waitFor(() => expect(screen.getByText('Spring Concert')).toBeTruthy());
    expect(screen.queryByText('Could not load events. Tap to retry.')).toBeNull();
  });
});
