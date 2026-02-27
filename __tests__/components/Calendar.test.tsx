import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Calendar } from '../../components/Calendar';
import type { CalendarEvent } from '../../lib/types';

jest.mock('react-native-calendars', () => {
  const React = require('react');
  const { View, TouchableOpacity, Text } = require('react-native');

  return {
    Calendar: ({
      current,
      onDayPress,
      onMonthChange,
    }: {
      current: string;
      onDayPress: (date: { dateString: string }) => void;
      onMonthChange: (date: { dateString: string }) => void;
    }) => (
      <View>
        <Text>{current}</Text>
        <TouchableOpacity
          testID="calendar-day-press"
          onPress={() => onDayPress({ dateString: '2026-04-20' })}
        >
          <Text>press-day</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="calendar-month-change"
          onPress={() => onMonthChange({ dateString: '2026-05-01' })}
        >
          <Text>change-month</Text>
        </TouchableOpacity>
      </View>
    ),
  };
});

describe('components/Calendar', () => {
  const events: CalendarEvent[] = [
    {
      id: 'ce-1',
      event_id: 'e-1',
      title: 'April 15 Event',
      description: null,
      image_url: null,
      url: null,
      event_date: '2026-04-15',
      event_time: null,
      sharer_contact_name: 'Alice',
      sharer_user_id: 'u-2',
    },
    {
      id: 'ce-2',
      event_id: 'e-2',
      title: 'April 20 Event',
      description: null,
      image_url: null,
      url: null,
      event_date: '2026-04-20',
      event_time: null,
      sharer_contact_name: null,
      sharer_user_id: 'u-3',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 3, 15, 12, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fetches the selected month range on initial render', () => {
    const onMonthChange = jest.fn();

    render(<Calendar events={events} onMonthChange={onMonthChange} />);

    expect(onMonthChange).toHaveBeenCalledWith('2026-04-01', '2026-04-30');
  });

  it('updates day events when a new day is selected', () => {
    const onMonthChange = jest.fn();
    const screen = render(<Calendar events={events} onMonthChange={onMonthChange} />);

    expect(screen.getByText('April 15 Event')).toBeTruthy();
    fireEvent.press(screen.getByTestId('calendar-day-press'));

    expect(screen.getByText('April 20 Event')).toBeTruthy();
    expect(screen.queryByText('April 15 Event')).toBeNull();
  });

  it('routes to onboarding reset, people, and add-event actions', async () => {
    const onMonthChange = jest.fn();
    const screen = render(<Calendar events={events} onMonthChange={onMonthChange} />);

    fireEvent.press(screen.getByText('?'));
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('onboarding_complete');
    expect(router.push).toHaveBeenCalledWith('/(app)/onboarding');

    fireEvent.press(screen.getByText('People'));
    expect(router.push).toHaveBeenCalledWith('/(app)/people');

    fireEvent.press(screen.getByText('+'));
    expect(router.push).toHaveBeenCalledWith('/(app)/add-event');
  });
});
