import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Calendar as RNCalendar, DateData } from 'react-native-calendars';
import { router } from 'expo-router';
import { EventCard } from './EventCard';
import type { CalendarEvent } from '../lib/types';

type Props = {
  events: CalendarEvent[];
  onMonthChange: (startDate: string, endDate: string) => void;
};

function getMonthRange(date: Date): { start: string; end: string } {
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function Calendar({ events, onMonthChange }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [lastFetchedMonth, setLastFetchedMonth] = useState<string>('');

  useEffect(() => {
    const date = new Date(selectedDate);
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthKey = `${year}-${month}`;

    if (monthKey !== lastFetchedMonth) {
      const { start, end } = getMonthRange(date);
      onMonthChange(start, end);
      setLastFetchedMonth(monthKey);
    }
  }, [selectedDate, onMonthChange, lastFetchedMonth]);

  const markedDates = events.reduce<Record<string, { marked: boolean }>>(
    (acc, e) => {
      if (!acc[e.event_date]) acc[e.event_date] = { marked: true };
      return acc;
    },
    {}
  );

  const dayEvents = events.filter((e) => e.event_date === selectedDate);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Events</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.peopleButton}
            onPress={() => router.push('/(app)/people')}
          >
            <Text style={styles.peopleButtonText}>People</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => router.push('/(app)/add-event')}
          >
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      <RNCalendar
        current={selectedDate}
        onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
        onMonthChange={(date: DateData) => {
          setSelectedDate(date.dateString);
        }}
        markedDates={{
          ...markedDates,
          [selectedDate]: {
            ...markedDates[selectedDate],
            selected: true,
            selectedColor: '#000',
          },
        }}
        theme={{
          todayTextColor: '#000',
          selectedDayBackgroundColor: '#000',
          selectedDayTextColor: '#fff',
          arrowColor: '#000',
        }}
      />
      <View style={styles.eventsList}>
        <Text style={styles.sectionTitle}>
          {dayEvents.length === 0
            ? 'No events'
            : `${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
        </Text>
        {dayEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onPress={() => router.push(`/(app)/event/${event.event_id}`)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  peopleButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  peopleButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  eventsList: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#666',
  },
});
