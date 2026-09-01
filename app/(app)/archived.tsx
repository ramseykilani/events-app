import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/dialogs';
import { localDateString } from '../../lib/format';
import { useSession } from '../_context/SessionContext';
import type { ArchivedEvent } from '../../lib/types';
import { useTheme } from '../../hooks/useTheme';
import { EventCard } from '../../components/EventCard';
import {
  previewFromCalendarEvent,
  rememberEventPreview,
} from '../../lib/eventPreviewCache';
import { isAbortError, withRetries, withWriteTimeout } from '../../lib/timeoutSignal';

// The Archived drawer (Archive Received Events, FEATURES.md 2026-09-01):
// every archived received event, upcoming first (nearest at top), then past
// (most recent first) — the server orders; the client renders. Restore is
// the only action: there is no remove-forever anywhere for received events.
// Entry point is the "Archived" link at the foot of the calendar, shown
// only when this list is non-empty.
export default function ArchivedScreen() {
  const { session } = useSession();
  const theme = useTheme();
  const [rows, setRows] = useState<ArchivedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const hasContentRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    if (!session?.user?.id) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    if (!hasContentRef.current) setLoading(true);
    try {
      const data = await withRetries(async (signal) => {
        const { data, error } = await supabase
          .rpc('get_archived_events', { p_today: localDateString(new Date()) })
          .abortSignal(signal);
        if (error) throw error;
        return data ?? [];
      });
      if (seq !== loadSeq.current) return;
      hasContentRef.current = true;
      setRows(
        (data as Record<string, unknown>[]).map((row) => ({
          id: row.id as string,
          title: row.title as string | null,
          description: row.description as string | null,
          image_url: row.image_url as string | null,
          location: row.location as string | null,
          url: row.url as string | null,
          event_date: row.event_date as string,
          event_time: row.event_time as string | null,
          sharer_contact_name: row.sharer_contact_name as string | null,
          sharer_person_id: row.sharer_person_id as string | null,
          sharer_user_id: row.sharer_user_id as string,
          from_user_id: row.from_user_id as string | null,
          archived_at: row.archived_at as string,
        }))
      );
      setLoadError(false);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      console.error('Failed to load archived events:', err);
      setLoadError(true);
      if (!hasContentRef.current) setRows([]);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openEvent = (event: ArchivedEvent) => {
    // Seed the archived provenance so the detail renders Restore (never a
    // Remove button) before its own fetch lands.
    rememberEventPreview({
      ...previewFromCalendarEvent(event),
      archived_at: event.archived_at,
    });
    router.push({
      pathname: '/(app)/event/[id]',
      params: {
        id: event.id,
        ...(event.sharer_person_id ? { sharedByPersonId: event.sharer_person_id } : {}),
      },
    });
  };

  const handleRestore = async (event: ArchivedEvent) => {
    if (restoringId !== null) return;
    setRestoringId(event.id);
    try {
      await withWriteTimeout(async (signal) => {
        const { error } = await supabase
          .rpc('set_event_archived', { p_event_id: event.id, p_archived: false })
          .abortSignal(signal);
        if (error) throw error;
      });
      setRows((prev) => prev.filter((r) => r.id !== event.id));
    } catch (err) {
      console.error('Failed to restore event:', err);
      showAlert(
        'Could not restore',
        isAbortError(err)
          ? 'That took too long. Check your connection and try again.'
          : 'Something went wrong. Try again.'
      );
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.navRow}>
        {/* conventions-ok: migrates to AppHeader in Design System Consolidation Phase 3 */}
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.6}
          accessibilityRole="button"
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
        >
          <Text style={[styles.navBack, { color: theme.textSecondary }]}>Back</Text>
        </TouchableOpacity>
      </View>
      {loadError ? (
        <TouchableOpacity
          style={[styles.refreshBanner, { backgroundColor: theme.surface }]}
          onPress={() => {
            setLoadError(false);
            if (!hasContentRef.current) setLoading(true);
            void load();
          }}
          activeOpacity={0.6}
          accessibilityRole="button"
        >
          <Text style={[styles.refreshBannerText, { color: theme.textPrimary }]}>
            Could not refresh. Retry
          </Text>
        </TouchableOpacity>
      ) : null}
      <ScrollView contentContainerStyle={styles.scrollContent}>
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
          Archived
        </Text>
        {loading && rows.length === 0 ? (
          <ActivityIndicator color={theme.textPrimary} style={styles.spinner} />
        ) : rows.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Nothing archived.
          </Text>
        ) : (
          rows.map((event) => (
            <View key={event.id} style={styles.row}>
              <View style={styles.cardWrap}>
                <EventCard event={event} onPress={() => openEvent(event)} />
              </View>
              <TouchableOpacity
                style={[styles.restoreButton, { backgroundColor: theme.surfaceSecondary }]}
                onPress={() => handleRestore(event)}
                activeOpacity={0.7}
                disabled={restoringId !== null}
                accessibilityRole="button"
                accessibilityLabel={`Restore ${event.title ?? 'untitled event'}`}
              >
                {restoringId === event.id ? (
                  <ActivityIndicator size="small" color={theme.textSecondary} />
                ) : (
                  <Text style={[styles.restoreButtonText, { color: theme.textPrimary }]}>
                    Restore
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navRow: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  navBack: {
    fontSize: 16,
  },
  refreshBanner: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  refreshBannerText: {
    fontSize: 14,
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    marginBottom: 16,
  },
  spinner: {
    marginTop: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardWrap: {
    flex: 1,
  },
  restoreButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 22,
    marginLeft: 12,
    marginBottom: 12,
  },
  restoreButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
