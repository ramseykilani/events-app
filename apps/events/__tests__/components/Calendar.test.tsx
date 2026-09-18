import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Calendar } from '../../components/Calendar';
import { ThemeContextProvider } from '../../app/_context/ThemeContext';
import type { CalendarEvent } from '../../lib/types';

// Mutable insets so the KI-005 pin below can simulate a device whose bottom
// system bar is non-zero (Android 3-button nav). The global jest.setup mock
// returns all-zero insets; this file-level mock replaces it.
const mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    SafeAreaProvider: View,
    useSafeAreaInsets: () => mockInsets,
  };
});

jest.mock('react-native-calendars', () => {
  const React = require('react');
  const { View, TouchableOpacity, Text } = require('react-native');

  return {
    Calendar: ({
      current,
      markedDates,
      onDayPress,
      onMonthChange,
    }: {
      current: string;
      markedDates?: Record<string, { marked?: boolean }>;
      onDayPress: (date: { dateString: string }) => void;
      onMonthChange: (date: { dateString: string }) => void;
    }) => (
      <View>
        <Text>{current}</Text>
        {Object.entries(markedDates ?? {})
          .filter(([, marking]) => marking.marked)
          .map(([date]) => (
            <Text key={date} testID={`marked-${date}`}>
              {date}
            </Text>
          ))}
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
      title: 'April 15 Event',
      description: null,
      image_url: null,
      location: null,
      url: null,
      event_date: '2026-04-15',
      event_time: null,
      sharer_contact_name: 'Alice',
      sharer_person_id: 'mp-1',
      sharer_user_id: 'u-2',
      from_user_id: 'u-2',
    },
    {
      id: 'ce-2',
      title: 'April 20 Event',
      description: null,
      image_url: null,
      location: null,
      url: null,
      event_date: '2026-04-20',
      event_time: null,
      sharer_contact_name: null,
      sharer_person_id: null,
      sharer_user_id: 'u-3',
      from_user_id: null,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 3, 15, 12, 0, 0));
    mockInsets.bottom = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fetches the visible grid range on initial render', () => {
    const onMonthChange = jest.fn();

    render(<Calendar events={events} onMonthChange={onMonthChange} />);

    // April 2026 runs Wednesday the 1st to Thursday the 30th, so the grid
    // spans Sunday March 29 through Saturday May 2.
    expect(onMonthChange).toHaveBeenCalledWith('2026-03-29', '2026-05-02');
  });

  it('fetches the grid range of the new month on month change', () => {
    const onMonthChange = jest.fn();
    const screen = render(<Calendar events={events} onMonthChange={onMonthChange} />);

    fireEvent.press(screen.getByTestId('calendar-month-change'));

    // May 2026: Friday the 1st, Sunday the 31st.
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-04-26', '2026-06-06');
  });

  it('marks events that fall on adjacent-month overflow days', () => {
    const onMonthChange = jest.fn();
    const overflowEvents: CalendarEvent[] = [
      ...events,
      {
        id: 'ce-3',
        title: 'March 29 Event',
        description: null,
        image_url: null,
        location: null,
        url: null,
        event_date: '2026-03-29',
        event_time: null,
        sharer_contact_name: null,
        sharer_person_id: null,
        sharer_user_id: 'u-4',
        from_user_id: null,
      },
    ];

    const screen = render(
      <Calendar events={overflowEvents} onMonthChange={onMonthChange} />
    );

    expect(screen.getByTestId('marked-2026-03-29')).toBeTruthy();
    expect(screen.getByTestId('marked-2026-04-15')).toBeTruthy();
  });

  it('updates day events when a new day is selected', () => {
    const onMonthChange = jest.fn();
    const screen = render(<Calendar events={events} onMonthChange={onMonthChange} />);

    expect(screen.getByText('April 15 Event')).toBeTruthy();
    fireEvent.press(screen.getByTestId('calendar-day-press'));

    expect(screen.getByText('April 20 Event')).toBeTruthy();
    expect(screen.queryByText('April 15 Event')).toBeNull();
  });

  it('routes to onboarding, people, and add-event actions', async () => {
    const onMonthChange = jest.fn();
    const screen = render(<Calendar events={events} onMonthChange={onMonthChange} />);

    fireEvent.press(screen.getByText('?'));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/(app)/onboarding')
    );
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('People'));
    expect(router.push).toHaveBeenCalledWith('/(app)/people');

    fireEvent.press(screen.getByText('+'));
    expect(router.push).toHaveBeenCalledWith('/(app)/add-event');
  });

  it('opens event detail with the calendar row id', () => {
    const onMonthChange = jest.fn();
    const screen = render(<Calendar events={events} onMonthChange={onMonthChange} />);

    fireEvent.press(screen.getByText('April 15 Event'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(app)/event/[id]',
      params: {
        id: 'ce-1',
        sharedByPersonId: 'mp-1',
      },
    });
  });

  it('renders the theme swatch and persists a switch to the next theme', async () => {
    const onMonthChange = jest.fn();
    const screen = render(
      <ThemeContextProvider>
        <Calendar events={events} onMonthChange={onMonthChange} />
      </ThemeContextProvider>
    );
    await act(async () => {});

    // From Paper (the default), the swatch offers Evening.
    fireEvent.press(screen.getByLabelText('Switch to Evening theme'));

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'theme_preference',
      'evening'
    );
    // Once in Evening, the swatch offers Paper again.
    expect(screen.getByLabelText('Switch to Paper theme')).toBeTruthy();
  });

  it('hides the Archived link when the drawer is empty', () => {
    const onMonthChange = jest.fn();
    const screen = render(<Calendar events={events} onMonthChange={onMonthChange} />);

    expect(screen.queryByLabelText('Archived events')).toBeNull();
  });

  it('shows the Archived link when the drawer is non-empty and opens it', () => {
    const onMonthChange = jest.fn();
    const screen = render(
      <Calendar events={events} onMonthChange={onMonthChange} hasArchived />
    );

    fireEvent.press(screen.getByLabelText('Archived events'));
    expect(router.push).toHaveBeenCalledWith('/(app)/archived');
  });

  // KI-005 regression pin: with a non-zero bottom system bar (Android
  // 3-button nav — edge-to-edge is OS-enforced on Android 15+), the events
  // list must pad its scroll content so the last event / Archived link can
  // scroll fully clear of the bar.
  it('pads the events list clear of the bottom system bar (KI-005)', () => {
    mockInsets.bottom = 48;
    const onMonthChange = jest.fn();
    const screen = render(<Calendar events={events} onMonthChange={onMonthChange} />);

    const list = screen.UNSAFE_getByType(ScrollView);
    const contentStyle = list.props.contentContainerStyle;
    expect(contentStyle?.paddingBottom).toBeGreaterThanOrEqual(48);
  });
});
