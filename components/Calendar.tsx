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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { EventCard } from './EventCard';
import type { CalendarEvent } from '../lib/types';
import { useTheme } from '../hooks/useTheme';
import { useThemePreference } from '../app/_context/ThemeContext';
import { THEME_REGISTRY } from '../constants/Colors';

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
  const theme = useTheme();
  const { themeName, setTheme } = useThemePreference();
  const insets = useSafeAreaInsets();
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
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text
          style={[
            styles.title,
            {
              color: theme.textPrimary,
              fontFamily: theme.titleFontFamily,
              fontWeight: theme.titleFontWeight,
            },
          ]}
        >
          Events
        </Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.helpButton, { borderColor: theme.border }]}
            onPress={() => router.push('/(app)/onboarding')}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Help"
          >
            <Text style={[styles.helpButtonText, { color: theme.textSecondary }]}>?</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.peopleButton}
            onPress={() => router.push('/(app)/people')}
            activeOpacity={0.6}
            accessibilityRole="button"
          >
            <Text style={[styles.peopleButtonText, { color: theme.textPrimary }]}>People</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: theme.primaryButtonBg }]}
            onPress={() => router.push('/(app)/add-event')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add event"
          >
            <Text style={[styles.fabText, { color: theme.primaryButtonText }]}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View
        style={[
          styles.themePicker,
          { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
        ]}
        accessibilityRole="radiogroup"
        accessibilityLabel="Theme"
      >
        {THEME_REGISTRY.map((option) => {
          const selected = option.name === themeName;
          return (
            <TouchableOpacity
              key={option.name}
              style={[
                styles.themeOption,
                selected && {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => setTheme(option.name)}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${option.label} theme`}
            >
              <Text
                style={[
                  styles.themeOptionText,
                  { color: selected ? theme.textPrimary : theme.textSecondary },
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <RNCalendar
        // Remount on theme switch: react-native-calendars caches computed
        // styles internally, so a new theme object alone may not repaint.
        key={themeName}
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
            selectedColor: theme.calendarSelected,
          },
        }}
        theme={{
          backgroundColor: theme.background,
          calendarBackground: theme.background,
          dayTextColor: theme.textPrimary,
          todayTextColor: theme.calendarTodayText,
          selectedDayBackgroundColor: theme.calendarSelected,
          selectedDayTextColor: theme.calendarSelectedText,
          arrowColor: theme.textPrimary,
          monthTextColor: theme.textPrimary,
          textDisabledColor: theme.textTertiary,
          dotColor: theme.accent,
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
        {dayEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Nothing on this day.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(app)/add-event')}
              activeOpacity={0.6}
            >
              <Text style={[styles.emptyAction, { color: theme.linkText }]}>Add an event</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            {`${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
          </Text>
        )}
        {dayEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onPress={() =>
              router.push({
                pathname: '/(app)/event/[id]',
                params: {
                  id: event.event_id,
                  ...(event.sharer_person_id
                    ? { sharedByPersonId: event.sharer_person_id }
                    : {}),
                },
              })
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  themePicker: {
    flexDirection: 'row',
    alignSelf: 'center',
    borderRadius: 22,
    borderWidth: 1,
    padding: 3,
    marginBottom: 12,
  },
  themeOption: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 16,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  helpButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpButtonText: {
    fontSize: 16,
    fontWeight: '600',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
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
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
  },
  emptyAction: {
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});
