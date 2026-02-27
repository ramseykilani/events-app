import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Calendar as RNCalendar, DateData } from 'react-native-calendars';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventCard } from './EventCard';
import type { CalendarEvent } from '../lib/types';

type Props = {
  events: CalendarEvent[];
  onMonthChange: (startDate: string, endDate: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
};

function toLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthRange(dateString: string): { start: string; end: string } {
  const [yearStr, monthStr] = dateString.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${yearStr}-${monthStr}-01`,
    end: `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function Calendar({
  events,
  onMonthChange,
  refreshing = false,
  onRefresh,
}: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(
    toLocalDateString(new Date())
  );
  const [lastFetchedMonth, setLastFetchedMonth] = useState<string>('');

  useEffect(() => {
    const monthKey = selectedDate.slice(0, 7);

    if (monthKey !== lastFetchedMonth) {
      const { start, end } = getMonthRange(selectedDate);
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
            style={styles.helpButton}
            onPress={async () => {
              await AsyncStorage.removeItem('onboarding_complete');
              router.push('/(app)/onboarding');
            }}
          >
            <Text style={styles.helpButtonText}>?</Text>
          </TouchableOpacity>
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
      <ScrollView
        style={styles.eventsList}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
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
      </ScrollView>
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
  helpButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
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
