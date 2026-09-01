import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { WebDateInput, WebTimeInput, isPlausibleEventDate } from '../../components/WebDateTimeInputs';
import { supabase } from '../../lib/supabase';
import { showAlert, showConfirm } from '../../lib/dialogs';
import { useSession } from '../_context/SessionContext';
import type { Event } from '../../lib/types';
import { useTheme } from '../../hooks/useTheme';
import {
  eventFromPreview,
  previewFromEvent,
  readEventPreview,
  rememberEventPreview,
} from '../../lib/eventPreviewCache';
import {
  isAbortError,
  withRetries,
  withWriteTimeout,
} from '../../lib/timeoutSignal';

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type IntendedEventFields = {
  title: string | null;
  description: string | null;
  url: string | null;
  imageUrl: string | null;
  location: string | null;
  eventDate: string;
  eventTime: string | null;
};

// Every field participates in the compare: a subset match can false-confirm
// (KI-002's lesson), and save_event's server-side no-op rule compares all
// seven the same way. Server time may carry fractional seconds.
function eventMatchesIntended(e: Event, intended: IntendedEventFields): boolean {
  return (
    (e.title ?? '') === (intended.title ?? '') &&
    (e.description ?? '') === (intended.description ?? '') &&
    (e.url ?? '') === (intended.url ?? '') &&
    (e.image_url ?? '') === (intended.imageUrl ?? '') &&
    (e.location ?? '') === (intended.location ?? '') &&
    e.event_date === intended.eventDate &&
    (e.event_time ? e.event_time.slice(0, 8) : null) === intended.eventTime
  );
}

function fieldsFromEvent(e: Event) {
  const [y, m, d] = e.event_date.split('-').map(Number);
  return {
    title: e.title ?? '',
    description: e.description ?? '',
    url: e.url ?? '',
    imageUrl: e.image_url ?? '',
    location: e.location ?? '',
    eventDate: new Date(y, m - 1, d),
    eventTime: e.event_time ? new Date(`1970-01-01T${e.event_time}`) : null,
  };
}

export default function EditEventScreen() {
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = firstParam(params.eventId);
  const preview = eventId ? readEventPreview(eventId) : undefined;
  const seeded = preview ? eventFromPreview(preview) : null;
  const seededFields = seeded ? fieldsFromEvent(seeded) : null;
  const { session } = useSession();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<Event | null>(seeded);
  const [title, setTitle] = useState(seededFields?.title ?? '');
  const [description, setDescription] = useState(seededFields?.description ?? '');
  const [url, setUrl] = useState(seededFields?.url ?? '');
  const [imageUrl, setImageUrl] = useState(seededFields?.imageUrl ?? '');
  const [location, setLocation] = useState(seededFields?.location ?? '');
  const [eventDate, setEventDate] = useState(seededFields?.eventDate ?? new Date());
  const [eventTime, setEventTime] = useState<Date | null>(seededFields?.eventTime ?? null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // A seeded form never refetches on mount: the preview (written from the
  // calendar/detail fetch moments ago) already holds everything the fetch
  // could return — and skipping it means no late response can overwrite what
  // the user has typed. `seeded` is rebuilt on every render, so capture it
  // once in a ref.
  const hadSeedOnMount = useRef(!!seeded);
  const saveInFlightRef = useRef(false);

  const applyEvent = (e: Event) => {
    const fields = fieldsFromEvent(e);
    setEvent(e);
    setTitle(fields.title);
    setDescription(fields.description);
    setUrl(fields.url);
    setImageUrl(fields.imageUrl);
    setLocation(fields.location);
    setEventDate(fields.eventDate);
    setEventTime(fields.eventTime);
    rememberEventPreview(previewFromEvent(e));
  };

  const load = useCallback(async () => {
    if (hadSeedOnMount.current) return;
    if (!eventId) {
      setLoadError(true);
      return;
    }

    try {
      const e = await withRetries(async (signal) => {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('id', eventId)
          .abortSignal(signal)
          .single();

        if (error) throw error;
        return data as Event;
      });
      setLoadError(false);
      applyEvent(e);
    } catch (err) {
      console.error('Failed to load event:', err);
      setLoadError(true);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // A timed-out write may still have committed server-side. save_event is
  // idempotent (set-to-value on the caller's own row), so reconcile by
  // reading: confirmation comes from the row itself. Returns the row when the
  // server already holds the intended values, else null. Retried like any
  // read — an abort can land while the server is still committing; a false
  // negative just means the user sees the alert.
  const reconcileTimedOutSave = async (
    intended: IntendedEventFields
  ): Promise<Event | null> => {
    if (!session?.user?.id || !eventId) return null;
    try {
      return await withRetries(async (signal) => {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('id', eventId)
          .abortSignal(signal)
          .single();

        if (error) throw error;
        const row = data as Event;
        if (eventMatchesIntended(row, intended)) return row;
        throw new Error('save not committed');
      });
    } catch {
      return null;
    }
  };

  const handleSave = async () => {
    if (!title.trim() && !url.trim()) {
      showAlert('Required', 'Enter a title or URL.');
      return;
    }

    if (!session?.user?.id || !eventId || !event) return;

    if (!isPlausibleEventDate(eventDate)) {
      // Same web year-typo guard as add-event (2026 -> 1906 is one slip away).
      showAlert(
        'Check the date',
        `That date is in ${eventDate.getFullYear()}. The date field can mistype years — please pick the date again.`
      );
      return;
    }

    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;

    const timeStr = eventTime
      ? eventTime.toTimeString().slice(0, 8)
      : null;

    const year = eventDate.getFullYear();
    const month = String(eventDate.getMonth() + 1).padStart(2, '0');
    const day = String(eventDate.getDate()).padStart(2, '0');
    const localDate = `${year}-${month}-${day}`;

    const intended: IntendedEventFields = {
      title: title.trim() || null,
      description: description.trim() || null,
      url: url.trim() || null,
      imageUrl: imageUrl.trim() || null,
      location: location.trim() || null,
      eventDate: localDate,
      eventTime: timeStr,
    };

    // A save that changes nothing never calls save_event: follow is preserved
    // without relying on the server's no-op rule (which is defense in depth).
    if (eventMatchesIntended(event, intended)) {
      saveInFlightRef.current = false;
      router.replace(`/(app)/event/${eventId}`);
      return;
    }

    setLoading(true);
    try {
      await withWriteTimeout(async (signal) => {
        const { data: savedId, error: saveErr } = await supabase
          .rpc('save_event', {
            p_id: eventId,
            p_url: intended.url,
            p_title: intended.title,
            p_description: intended.description,
            p_image_url: intended.imageUrl,
            p_location: intended.location,
            p_event_date: intended.eventDate,
            p_event_time: intended.eventTime,
          })
          .abortSignal(signal);

        if (saveErr) throw saveErr;
        if (savedId !== eventId) throw new Error('Failed to save event');
      });

      rememberEventPreview(
        previewFromEvent({
          ...(event as Event),
          title: intended.title,
          description: intended.description,
          url: intended.url,
          image_url: intended.imageUrl,
          location: intended.location,
          event_date: intended.eventDate,
          event_time: intended.eventTime,
          frozen: true,
        })
      );
      router.replace(`/(app)/event/${eventId}`);
    } catch (err: unknown) {
      console.error('Failed to save event:', err);
      if (isAbortError(err)) {
        const confirmed = await reconcileTimedOutSave(intended);
        if (confirmed) {
          rememberEventPreview(previewFromEvent(confirmed));
          router.replace(`/(app)/event/${eventId}`);
          return;
        }
      }
      showAlert(
        'Could not save',
        isAbortError(err)
          ? 'That took too long. Check your connection and try again.'
          : 'Something went wrong. Try again.'
      );
    } finally {
      saveInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleDelete = () => {
    showConfirm(
      'Remove Event',
      'Remove this event from your calendar? This only affects you — everyone you shared it with keeps their own copy.',
      {
        confirmText: 'Remove',
        destructive: true,
        onConfirm: async () => {
          if (saveInFlightRef.current) return;
          saveInFlightRef.current = true;
          setLoading(true);
          try {
            await withWriteTimeout(async (signal) => {
              const { error } = await supabase
                .from('events')
                .delete()
                .eq('id', eventId ?? '')
                .eq('owner_id', session?.user?.id ?? '')
                .abortSignal(signal);

              if (error) throw error;
            });
            router.replace('/(app)/');
          } catch (err) {
            console.error('Failed to remove event:', err);
            showAlert('Error', 'Failed to remove event');
          } finally {
            saveInFlightRef.current = false;
            setLoading(false);
          }
        },
      }
    );
  };

  if (loadError && !event) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[styles.loadErrorText, { color: theme.textSecondary }]}>
          Could not load this event.
        </Text>
        <TouchableOpacity
          onPress={() => void load()}
          activeOpacity={0.6}
          accessibilityRole="button"
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
        >
          <Text style={[styles.retry, { color: theme.linkText }]}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.6}
          accessibilityRole="button"
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
        >
          <Text style={[styles.retry, { color: theme.textSecondary }]}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[
        styles.container,
        { backgroundColor: theme.background, paddingTop: insets.top + 12 },
      ]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        // KI-005: keep Remove Event clear of the Android 3-button nav bar
        // (edge-to-edge is OS-enforced on Android 15+; 0 on web).
        contentContainerStyle={{ paddingBottom: insets.bottom }}
      >
        <View style={[styles.header, { borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.6}
          accessibilityRole="button"
          // hitSlop (not padding): pairs with the baselined add-event form.
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
        >
          <Text style={[styles.cancel, { color: theme.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Edit event</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={loading || !event || (!title.trim() && !url.trim())}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading || !event || (!title.trim() && !url.trim()) }}
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
        >
          <Text
            style={[
              styles.save,
              { color: theme.textPrimary },
              (loading || !event || (!title.trim() && !url.trim())) && { color: theme.textTertiary },
            ]}
          >
            Save
          </Text>
        </TouchableOpacity>
        </View>
        {!event ? (
          <View style={[styles.centered, { paddingTop: 48 }]}>
            <ActivityIndicator color={theme.textPrimary} />
          </View>
        ) : (
      <View style={styles.form}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>URL (optional)</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
          placeholder="https://..."
          placeholderTextColor={theme.textTertiary}
          value={url}
          onChangeText={setUrl}
          keyboardType="url"
          autoCapitalize="none"
        />
        <Text style={[styles.label, { color: theme.textSecondary }]}>Title</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
          placeholder="Event title"
          placeholderTextColor={theme.textTertiary}
          value={title}
          onChangeText={setTitle}
        />
        <Text style={[styles.label, { color: theme.textSecondary }]}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea, { borderColor: theme.border, color: theme.textPrimary }]}
          placeholder="Description"
          placeholderTextColor={theme.textTertiary}
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <Text style={[styles.label, { color: theme.textSecondary }]}>Location (optional)</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
          placeholder="Venue or address"
          placeholderTextColor={theme.textTertiary}
          value={location}
          onChangeText={setLocation}
        />
        <Text style={[styles.label, { color: theme.textSecondary }]}>Date</Text>
        {Platform.OS === 'web' ? (
          <WebDateInput value={eventDate} onChange={setEventDate} />
        ) : (
          <>
            <TouchableOpacity
              style={[styles.input, { borderColor: theme.border }]}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.6}
              accessibilityRole="button"
            >
              <Text style={{ color: theme.textPrimary }}>{eventDate.toLocaleDateString()}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={eventDate}
                mode="date"
                onChange={(_, d) => {
                  setShowDatePicker(false);
                  if (d) setEventDate(d);
                }}
              />
            )}
          </>
        )}
        <Text style={[styles.label, { color: theme.textSecondary }]}>Time (optional)</Text>
        {Platform.OS === 'web' ? (
          <WebTimeInput value={eventTime} onChange={setEventTime} />
        ) : (
          <>
            <TouchableOpacity
              style={[styles.input, { borderColor: theme.border }]}
              onPress={() => setShowTimePicker(true)}
              activeOpacity={0.6}
              accessibilityRole="button"
            >
              <Text style={{ color: theme.textPrimary }}>
                {eventTime
                  ? eventTime.toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : 'Not set'}
              </Text>
            </TouchableOpacity>
            {showTimePicker && (
              <DateTimePicker
                value={eventTime ?? new Date()}
                mode="time"
                onChange={(_, d) => {
                  setShowTimePicker(false);
                  if (d) setEventTime(d);
                }}
              />
            )}
          </>
        )}
        {event.from_user_id === null && (
          // Received rows have no delete path (Archive Received Events,
          // KI-015): Archive lives on the detail screen. save_event sets
          // frozen but never clears from_user_id, so an edited received
          // row stays received.
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: theme.destructiveBg }]}
            onPress={handleDelete}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={[styles.deleteButtonText, { color: theme.destructiveText }]}>Remove Event</Text>
          </TouchableOpacity>
        )}
        </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadErrorText: {
    fontSize: 16,
  },
  retry: {
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  cancel: {
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  save: {
    fontSize: 16,
    fontWeight: '600',
  },
  form: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
  },
  deleteButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 32,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
