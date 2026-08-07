import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calendar } from '../../components/Calendar';
import { useSession } from '../_context/SessionContext';
import { supabase } from '../../lib/supabase';
import type { CalendarEvent } from '../../lib/types';

const ONBOARDING_KEY = 'onboarding_complete';

export default function CalendarScreen() {
  const { session } = useSession();
  const theme = useTheme();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const lastRangeRef = useRef<{ start: string; end: string } | null>(null);
  const fetchSeq = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((value) => {
      if (value !== 'true') {
        router.replace('/(app)/onboarding');
      }
    });
  }, []);

  const doFetch = useCallback(
    async (startDate: string, endDate: string) => {
      if (!session?.user?.id) return;
      const seq = ++fetchSeq.current;

      const { data, error } = await supabase.rpc('get_calendar_events', {
        p_user_id: session.user.id,
        p_start_date: startDate,
        p_end_date: endDate,
      });

      if (seq !== fetchSeq.current) return;

      if (error) {
        console.error('get_calendar_events RPC error:', error);
        setFetchError('Could not load events. Tap to retry.');
        return;
      }

      setFetchError(null);
      setEvents(
        (data ?? []).map((row: Record<string, unknown>) => ({
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
        }))
      );
    },
    [session?.user?.id]
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
