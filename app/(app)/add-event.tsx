import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Crypto from 'expo-crypto';
import { WebDateInput, WebTimeInput, isPlausibleEventDate } from '../../components/WebDateTimeInputs';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/dialogs';
import { useSession } from '../_context/SessionContext';
import { useTheme } from '../../hooks/useTheme';
import { isAbortError, withFetchTimeout, withWriteTimeout } from '../../lib/timeoutSignal';

export default function AddEventScreen() {
  const { session } = useSession();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [eventDate, setEventDate] = useState(new Date());
  const [eventTime, setEventTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [loadingOg, setLoadingOg] = useState(false);
  const [loading, setLoading] = useState(false);
  const createInFlightRef = useRef(false);
  // The new row's id is client-generated (save_event is idempotent on it), so
  // a re-tap after a timed-out create retries the SAME row instead of
  // risking a duplicate. Held for the life of the form.
  const newEventIdRef = useRef<string | null>(null);

  const fetchOgMetadata = async () => {
    if (!url.trim()) return;

    setLoadingOg(true);
    try {
      const { data, error } = await supabase.functions.invoke('og-metadata', {
        body: { url: url.trim() },
      });

      if (error) {
        // OG metadata is best-effort; URL entry should not fail if preview fetch fails.
        console.warn('OG fetch skipped:', error.message);
        return;
      }

      if (data?.title) setTitle(data.title);
      if (data?.description) setDescription(data.description ?? '');
      if (data?.image_url) setImageUrl(data.image_url ?? '');
    } catch (err) {
      console.warn('OG fetch failed:', err);
    } finally {
      setLoadingOg(false);
    }
  };

  // Per-user dedup: events RLS is owner-only, so this only ever matches rows
  // already on the caller's own calendar (no cross-user aspect).
  const checkExistingEvents = async (): Promise<{ id: string; title: string | null; event_date: string }[] | null> => {
    if (!url.trim()) return null;
    try {
      return await withFetchTimeout(async (signal) => {
        const { data, error } = await supabase
          .from('events')
          .select('id, title, event_date')
          .eq('url', url.trim())
          .abortSignal(signal)
          .limit(5);
        if (error) throw error;
        return data ?? [];
      });
    } catch (err) {
      // Best-effort dedup check: failing open to "no match" keeps Save usable.
      console.warn('Existing-event check skipped:', err);
      return [];
    }
  };

  const chooseExistingEvent = async (
    existing: { id: string; title: string | null; event_date: string }[]
  ): Promise<string | null> => {
    // Web has no multi-option native dialog (Alert.alert is a no-op there), so
    // offer the top match via window.confirm; cancel falls through to "create new".
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const top = existing[0];
      const useExisting = window.confirm(
        `Existing event\n\nThis URL has already been added as "${top.title ?? 'Untitled'} (${top.event_date})".\n\nOK: use the existing event\nCancel: create a new one`
      );
      return useExisting ? top.id : null;
    }
    return new Promise<string | null>((resolve) => {
      const options = existing.slice(0, 3).map((event) => ({
        text: `${event.title ?? 'Untitled'} (${event.event_date})`,
        onPress: () => resolve(event.id),
      }));
      // Native needs a multi-option dialog (one button per existing event),
      // which showConfirm can't express; web never reaches this branch (it
      // takes the window.confirm path above). conventions-ok
      Alert.alert(
        'Existing event',
        'This URL has already been added. Choose an existing event or create a new one.',
        [
          ...options,
          { text: 'Create new', style: 'cancel', onPress: () => resolve(null) },
        ]
      );
    });
  };

  const handleCreate = async () => {
    if (!title.trim() && !url.trim()) {
      showAlert('Required', 'Enter a title or URL.');
      return;
    }

    if (!session?.user?.id) return;
    if (createInFlightRef.current) return;
    createInFlightRef.current = true;
    setLoading(true);

    try {
      if (url.trim()) {
        const existing = await checkExistingEvents();
        if (existing && existing.length > 0) {
          const eventId = await chooseExistingEvent(existing);
          if (eventId) {
            // The URL is already on the caller's calendar — jump to that row
            // instead of adding a second copy.
            router.replace({ pathname: '/(app)/event/[id]', params: { id: eventId } });
            return;
          }
        }
      }

      if (!isPlausibleEventDate(eventDate)) {
        // The web date widget makes year typos easy (2026 -> 1906) and the event
        // would silently land a century off; block with a clear message.
        showAlert(
          'Check the date',
          `That date is in ${eventDate.getFullYear()}. The date field can mistype years — please pick the date again.`
        );
        return;
      }

      if (!newEventIdRef.current) newEventIdRef.current = Crypto.randomUUID();
      const newId = newEventIdRef.current;

      await withWriteTimeout(async (signal) => {
        const timeStr = eventTime
          ? eventTime.toTimeString().slice(0, 8)
          : null;

        const year = eventDate.getFullYear();
        const month = String(eventDate.getMonth() + 1).padStart(2, '0');
        const day = String(eventDate.getDate()).padStart(2, '0');
        const localDate = `${year}-${month}-${day}`;

        const { data: savedId, error: saveErr } = await supabase
          .rpc('save_event', {
            p_id: newId,
            p_url: url.trim() || null,
            p_title: title.trim() || null,
            p_description: description.trim() || null,
            p_image_url: imageUrl.trim() || null,
            p_event_date: localDate,
            p_event_time: timeStr,
          })
          .abortSignal(signal);

        if (saveErr) throw saveErr;
        if (savedId !== newId) throw new Error('Failed to create event');
      });

      router.replace({
        pathname: '/(app)/share',
        params: { eventId: newId },
      });
    } catch (err: unknown) {
      console.error('Failed to create event:', err);
      showAlert(
        'Could not save',
        isAbortError(err)
          ? 'That took too long. Check your connection and try again.'
          : 'Something went wrong. Try again.'
      );
    } finally {
      createInFlightRef.current = false;
      setLoading(false);
    }
  };

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
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.6}
          accessibilityRole="button"
          // hitSlop (not padding): this screen has a pixel-diff baseline.
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
        >
          <Text style={[styles.cancel, { color: theme.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Add event</Text>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={loading || (!title.trim() && !url.trim())}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading || (!title.trim() && !url.trim()) }}
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
        >
          <Text
            style={[
              styles.save,
              { color: theme.textPrimary },
              (loading || (!title.trim() && !url.trim())) && { color: theme.textTertiary },
            ]}
          >
            Save
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.form}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>URL (optional)</Text>
        <View style={styles.urlRow}>
          <TextInput
            // flex: 1 — without it the row layout collapses the field to
            // intrinsic width on web (~quarter width on desktop).
            style={[styles.input, { flex: 1, borderColor: theme.border, color: theme.textPrimary }]}
            placeholder="https://..."
            placeholderTextColor={theme.textTertiary}
            value={url}
            onChangeText={setUrl}
            onBlur={fetchOgMetadata}
            keyboardType="url"
            autoCapitalize="none"
          />
          {loadingOg && <ActivityIndicator size="small" />}
        </View>
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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
