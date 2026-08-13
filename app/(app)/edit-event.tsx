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
import { showError } from '../../lib/showError';
import { useSession } from '../_context/SessionContext';
import type { Event } from '../../lib/types';
import { useTheme } from '../../hooks/useTheme';
import {
  eventFromPreview,
  previewFromEvent,
  readEventPreview,
  rememberEventPreview,
} from '../../lib/eventPreviewCache';
import { withRetries, withTimeout } from '../../lib/timeoutSignal';

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function fieldsFromEvent(e: Event) {
  const [y, m, d] = e.event_date.split('-').map(Number);
  return {
    title: e.title ?? '',
    description: e.description ?? '',
    url: e.url ?? '',
    imageUrl: e.image_url ?? '',
    eventDate: new Date(y, m - 1, d),
    eventTime: e.event_time ? new Date(`1970-01-01T${e.event_time}`) : null,
  };
}

export default function EditEventScreen() {
  const params = useLocalSearchParams<{ eventId?: string | string[]; userEventId?: string | string[] }>();
  const eventId = firstParam(params.eventId);
  const userEventId = firstParam(params.userEventId);
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
  const [eventDate, setEventDate] = useState(seededFields?.eventDate ?? new Date());
  const [eventTime, setEventTime] = useState<Date | null>(seededFields?.eventTime ?? null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // A seeded form is editable while the refresh fetch is still in flight, so
  // the user can type before it lands. Events are immutable — the fetch can
  // only return what the preview already shows.
  const seededOnMount = useRef(!!seeded);

  const applyEvent = (e: Event) => {
    setEvent(e);
    rememberEventPreview(previewFromEvent(e, userEventId));
    // Never overwrite a seeded form: the fetch resolves after the user has
    // already typed, and applying it would clobber their edits.
    if (seededOnMount.current) return;
    const fields = fieldsFromEvent(e);
    setTitle(fields.title);
    setDescription(fields.description);
    setUrl(fields.url);
    setImageUrl(fields.imageUrl);
    setEventDate(fields.eventDate);
    setEventTime(fields.eventTime);
  };

  const load = useCallback(async () => {
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
  }, [eventId, userEventId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!title.trim() && !url.trim()) {
      showAlert('Required', 'Enter a title or URL.');
      return;
    }

    if (!session?.user?.id || !userEventId || !event) return;

    if (!isPlausibleEventDate(eventDate)) {
      // Same web year-typo guard as add-event (2026 -> 1906 is one slip away).
      showAlert(
        'Check the date',
        `That date is in ${eventDate.getFullYear()}. The date field can mistype years — please pick the date again.`
      );
      return;
    }

    setLoading(true);
    try {
      await withTimeout(async (signal) => {
        const timeStr = eventTime
          ? eventTime.toTimeString().slice(0, 8)
          : null;

        const year = eventDate.getFullYear();
        const month = String(eventDate.getMonth() + 1).padStart(2, '0');
        const day = String(eventDate.getDate()).padStart(2, '0');
        const localDate = `${year}-${month}-${day}`;

        const { data: newEventId, error: eventErr } = await supabase
          .rpc('find_or_create_event', {
            p_url: url.trim() || null,
            p_title: title.trim() || null,
            p_description: description.trim() || null,
            p_image_url: imageUrl.trim() || null,
            p_event_date: localDate,
            p_event_time: timeStr,
          })
          .abortSignal(signal);

        if (eventErr) throw eventErr;
        if (!newEventId) throw new Error('Failed to create event');

        const { error: ueErr } = await supabase
          .from('user_events')
          .update({ event_id: newEventId })
          .eq('id', userEventId)
          .eq('user_id', session.user.id)
          .abortSignal(signal);

        if (ueErr) {
          // If update fails because the user already owns the target snapshot,
          // merge into that existing user_events row instead of duplicating it:
          // carry over shares that aren't already there, then drop the old row
          // (its remaining duplicate shares cascade away).
          if (ueErr.code === '23505') {
            const { data: existingUe, error: findErr } = await supabase
              .from('user_events')
              .select('id')
              .eq('user_id', session.user.id)
              .eq('event_id', newEventId)
              .abortSignal(signal)
              .single();
            if (findErr || !existingUe) {
              throw findErr ?? new Error('Failed to find the existing event copy');
            }

            const [{ data: targetShares }, { data: sourceShares }] = await Promise.all([
              supabase
                .from('event_shares')
                .select('person_id')
                .eq('user_event_id', existingUe.id)
                .abortSignal(signal),
              supabase
                .from('event_shares')
                .select('person_id')
                .eq('user_event_id', userEventId)
                .abortSignal(signal),
            ]);

            const alreadyShared = new Set((targetShares ?? []).map((s) => s.person_id));
            const toMove = (sourceShares ?? [])
              .map((s) => s.person_id)
              .filter((pid) => !alreadyShared.has(pid));

            if (toMove.length > 0) {
              const { error: moveErr } = await supabase
                .from('event_shares')
                .insert(
                  toMove.map((person_id) => ({
                    user_event_id: existingUe.id,
                    person_id,
                  }))
                )
                .abortSignal(signal);
              if (moveErr) throw moveErr;
            }

            const { error: delErr } = await supabase
              .from('user_events')
              .delete()
              .eq('id', userEventId)
              .abortSignal(signal);

            if (delErr) throw delErr;
          } else {
            throw ueErr;
          }
        }

        rememberEventPreview(
          previewFromEvent(
            {
              ...(event as Event),
              id: newEventId as string,
              title: title.trim() || null,
              description: description.trim() || null,
              url: url.trim() || null,
              image_url: imageUrl.trim() || null,
              event_date: localDate,
              event_time: timeStr,
            },
            userEventId
          )
        );
        router.replace(`/(app)/event/${newEventId}`);
      });
    } catch (err: unknown) {
      showError('Error', err);
    } finally {
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
          setLoading(true);
          try {
            await withTimeout(async (signal) => {
              const { error } = await supabase
                .from('user_events')
                .delete()
                .eq('id', userEventId)
                .eq('user_id', session?.user?.id ?? '')
                .abortSignal(signal);

              if (error) throw error;
            });
            router.replace('/(app)/');
          } catch (err) {
            console.error('Failed to remove event:', err);
            showAlert('Error', 'Failed to remove event');
          } finally {
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
        <TouchableOpacity onPress={() => void load()} activeOpacity={0.6} accessibilityRole="button">
          <Text style={[styles.retry, { color: theme.linkText }]}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6} accessibilityRole="button">
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
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={[styles.header, { borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6} accessibilityRole="button">
          <Text style={[styles.cancel, { color: theme.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Edit event</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={loading || !event || (!title.trim() && !url.trim())}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading || !event || (!title.trim() && !url.trim()) }}
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
          editable={false}
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
        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: theme.destructiveBg }]}
          onPress={handleDelete}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={[styles.deleteButtonText, { color: theme.destructiveText }]}>Remove Event</Text>
        </TouchableOpacity>
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
