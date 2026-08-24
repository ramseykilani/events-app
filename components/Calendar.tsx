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
import {
  previewFromCalendarEvent,
  rememberEventPreview,
} from '../lib/eventPreviewCache';
import { useTheme } from '../hooks/useTheme';
import { useThemePreference } from '../app/_context/ThemeContext';
import { Colors, THEME_REGISTRY } from '../constants/Colors';

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
          {(() => {
            // The swatch previews the NEXT theme in the registry (its ground +
            // accent) and cycles on tap — a third theme needs no new control.
            const next =
              THEME_REGISTRY[
                (THEME_REGISTRY.findIndex((t) => t.name === themeName) + 1) %
                  THEME_REGISTRY.length
              ];
            const nextPalette = Colors[next.name];
            return (
              <TouchableOpacity
                style={styles.themeButton}
                onPress={() => setTheme(next.name)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${next.label} theme`}
              >
                <View
                  style={[
                    styles.themeSwatch,
                    {
                      backgroundColor: nextPalette.background,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.themeSwatchCore,
                      { backgroundColor: nextPalette.accent },
                    ]}
                  />
                </View>
              </TouchableOpacity>
            );
          })()}
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
          // Without this, the dot on the selected day falls back to the
          // library default (white) — invisible-ish on Paper's ochre and
          // off-token on Evening (design doc §9: a visual decision without a
          // token is a defect).
          selectedDotColor: theme.calendarSelectedText,
          textMonthFontFamily: theme.titleFontFamily,
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
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
            onPress={() => {
              rememberEventPreview(previewFromCalendarEvent(event));
              router.push({
                pathname: '/(app)/event/[id]',
                params: {
                  id: event.id,
                  ...(event.sharer_person_id
                    ? { sharedByPersonId: event.sharer_person_id }
                    : {}),
                },
              });
            }}
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
  themeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeSwatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeSwatchCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
    // 44pt touch target; the 48px-tall header row (fab) absorbs the extra
    // height, so this moves no pixels.
    minHeight: 44,
    justifyContent: 'center',
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
