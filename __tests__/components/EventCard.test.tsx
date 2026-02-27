import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { EventCard } from '../../components/EventCard';
import type { CalendarEvent } from '../../lib/types';

describe('components/EventCard', () => {
  it('renders fallback title and triggers press handler', () => {
    const onPress = jest.fn();
    const event: CalendarEvent = {
      id: 'ce-1',
      event_id: 'e-1',
      title: null,
      description: null,
      image_url: null,
      url: null,
      event_date: '2026-02-27',
      event_time: null,
      sharer_contact_name: null,
      sharer_user_id: 'u-1',
    };

    const screen = render(<EventCard event={event} onPress={onPress} />);

    expect(screen.getByText('Untitled event')).toBeTruthy();
    fireEvent.press(screen.getByText('Untitled event'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders sharer information when present', () => {
    const event: CalendarEvent = {
      id: 'ce-2',
      event_id: 'e-2',
      title: 'Board Game Night',
      description: null,
      image_url: null,
      url: null,
      event_date: '2026-02-27',
      event_time: '19:30:00',
      sharer_contact_name: 'Alice',
      sharer_user_id: 'u-2',
    };

    const screen = render(<EventCard event={event} onPress={jest.fn()} />);

    expect(screen.getByText('Board Game Night')).toBeTruthy();
    expect(screen.getByText('From Alice')).toBeTruthy();
  });
});
