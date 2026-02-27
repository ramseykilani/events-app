import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CalendarScreen from '../../../app/(app)/index';

const mockRpc = jest.fn();

jest.mock('../../../app/context/SessionContext', () => ({
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

describe('app/(app)/index', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
  });

  it('redirects to onboarding when onboarding is incomplete', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    render(<CalendarScreen />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/(app)/onboarding');
    });
  });

  it('fetches events for selected month and refreshes using last range', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'ce-1',
          event_id: 'e-1',
          title: 'Spring Concert',
          description: null,
          image_url: null,
          url: null,
          event_date: '2026-04-20',
          event_time: null,
          sharer_contact_name: 'Alice',
          sharer_user_id: 'u2',
        },
      ],
      error: null,
    });

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
});
