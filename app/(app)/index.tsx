import { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calendar } from '../../components/Calendar';
import { NotificationPermissionGate } from '../../components/NotificationPermissionGate';
import { useSession } from '../_context/SessionContext';
import { supabase } from '../../lib/supabase';
import { withRetries } from '../../lib/timeoutSignal';
import type { CalendarEvent } from '../../lib/types';

const ONBOARDING_KEY = 'onboarding_complete';

export default function CalendarScreen() {
  const { session } = useSession();
  const theme = useTheme();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [notifCheckKey, setNotifCheckKey] = useState(0);
  const lastRangeRef = useRef<{ start: string; end: string } | null>(null);
  const fetchSeq = useRef(0);
  const onboardCheckedRef = useRef(false);

  // The walkthrough is shown automatically at most once, and only to users
  // with no events at all — someone who was shared an event should land
  // directly on their calendar. It can always be reopened via the ? button.
  // Returns true when the walkthrough took over the screen.
  const maybeShowOnboarding = useCallback(async (): Promise<boolean> => {
    if (!session?.user?.id) return false;
    const flag = await AsyncStorage.getItem(ONBOARDING_KEY);
    if (flag === 'true') return false;

    let rowCount = 0;
    try {
      const year = new Date().getFullYear();
      rowCount = await withRetries(async (signal) => {
        const { data, error } = await supabase
          .rpc('get_calendar_events', {
            p_user_id: session.user.id,
            p_start_date: `${year - 1}-01-01`,
            p_end_date: `${year + 1}-12-31`,
          })
          .abortSignal(signal);
        if (error) throw error;
        return (data ?? []).length;
      });
    } catch (err) {
      // Best-effort check: a failed read must not crash the calendar or turn
      // into an unhandled rejection.
      console.error('onboarding check failed:', err);
      return false;
    }
    if (rowCount > 0) return false;

    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.push('/(app)/onboarding');
    return true;
  }, [session?.user?.id]);

  const doFetch = useCallback(
    async (startDate: string, endDate: string) => {
      if (!session?.user?.id) return;
      const seq = ++fetchSeq.current;

      try {
        const data = await withRetries(async (signal) => {
          const { data, error } = await supabase
            .rpc('get_calendar_events', {
              p_user_id: session.user.id,
              p_start_date: startDate,
              p_end_date: endDate,
            })
            .abortSignal(signal);
          if (error) throw error;
          return data ?? [];
        });

        if (seq !== fetchSeq.current) return;

        setFetchError(null);
        const mapped: CalendarEvent[] = data.map(
          (row: Record<string, unknown>) => ({
            id: row.id as string,
            event_id: row.event_id as string,
            title: row.title as string | null,
            description: row.description as string | null,
            image_url: row.image_url as string | null,
            url: row.url as string | null,
            event_date: row.event_date as string,
            event_time: row.event_time as string | null,
            sharer_contact_name: row.sharer_contact_name as string | null,
            sharer_person_id: row.sharer_person_id as string | null,
            sharer_user_id: row.sharer_user_id as string,
          })
        );
        setEvents(mapped);

        if (!onboardCheckedRef.current) {
          onboardCheckedRef.current = true;
          const walkthroughShown =
            mapped.length === 0 ? await maybeShowOnboarding() : false;
          // The notification explainer must never stack on the walkthrough —
          // the gate is only triggered once the calendar stays on screen.
          if (!walkthroughShown) setNotifCheckKey((k) => k + 1);
        } else {
          setNotifCheckKey((k) => k + 1);
        }
      } catch (err) {
        if (seq !== fetchSeq.current) return;
        // Keep last-good events on screen; the banner offers a manual retry.
        console.error('get_calendar_events RPC error:', err);
        setFetchError('Could not load events. Tap to retry.');
      }
    },
    [session?.user?.id, maybeShowOnboarding]
  );

  const handleRefresh = useCallback(async () => {
    if (lastRangeRef.current) {
      setRefreshing(true);
      await doFetch(lastRangeRef.current.start, lastRangeRef.current.end);
      setRefreshing(false);
    }
  }, [doFetch]);

  const handleMonthChange = useCallback(
    (startDate: string, endDate: string) => {
      lastRangeRef.current = { start: startDate, end: endDate };
      doFetch(startDate, endDate);
    },
    [doFetch]
  );

  useFocusEffect(
    useCallback(() => {
      if (lastRangeRef.current) {
        doFetch(lastRangeRef.current.start, lastRangeRef.current.end);
      }
    }, [doFetch])
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {fetchError ? (
        <TouchableOpacity
          style={[styles.errorBanner, { backgroundColor: theme.surface }]}
          onPress={handleRefresh}
          accessibilityRole="button"
        >
          <Text style={[styles.errorText, { color: theme.textPrimary }]}>{fetchError}</Text>
        </TouchableOpacity>
      ) : null}
      <Calendar
        events={events}
        onMonthChange={handleMonthChange}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />
      {session?.user?.id ? (
        <NotificationPermissionGate
          userId={session.user.id}
          checkKey={notifCheckKey}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorBanner: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
  },
});
