import { useState, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Calendar } from '../../components/Calendar';
import { useSession } from '../context/SessionContext';
import { supabase } from '../../lib/supabase';
import type { CalendarEvent } from '../../lib/types';

const ONBOARDING_KEY = 'onboarding_complete';

export default function CalendarScreen() {
  const { session } = useSession();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const lastRangeRef = useRef<{ start: string; end: string } | null>(null);

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

      const { data, error } = await supabase.rpc('get_calendar_events', {
        p_user_id: session.user.id,
        p_start_date: startDate,
        p_end_date: endDate,
      });

      if (error) {
        console.error('Failed to fetch calendar events:', error);
        return;
      }

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
    <View style={styles.container}>
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
    backgroundColor: '#fff',
  },
});
