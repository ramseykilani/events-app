import { useState, useEffect, useCallback } from 'react';
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
import { WebDateInput, WebTimeInput } from '../../components/WebDateTimeInputs';
import { supabase } from '../../lib/supabase';
import { showAlert, showConfirm } from '../../lib/dialogs';
import { showError } from '../../lib/showError';
import { useSession } from '../_context/SessionContext';
import type { Event } from '../../lib/types';
import { useTheme } from '../../hooks/useTheme';

export default function EditEventScreen() {
  const params = useLocalSearchParams<{ eventId: string; userEventId: string }>();
  const { session } = useSession();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<Event | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [eventDate, setEventDate] = useState(new Date());
  const [eventTime, setEventTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!params.eventId) return;

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', params.eventId)
      .single();

    if (error) {
      console.error('Failed to load event:', error);
      setLoadError(true);
      return;
    }

    setLoadError(false);
    const e = data as Event;
    setEvent(e);
    setTitle(e.title ?? '');
    setDescription(e.description ?? '');
    setUrl(e.url ?? '');
    setImageUrl(e.image_url ?? '');
    const [y, m, d] = e.event_date.split('-').map(Number);
    setEventDate(new Date(y, m - 1, d));
    setEventTime(
      e.event_time ? new Date(`1970-01-01T${e.event_time}`) : null
    );
  }, [params.eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!title.trim() && !url.trim()) {
      showAlert('Required', 'Enter a title or URL.');
      return;
    }

    if (!session?.user?.id || !params.userEventId || !event) return;

    setLoading(true);
    try {
      const timeStr = eventTime
        ? eventTime.toTimeString().slice(0, 8)
        : null;

      const year = eventDate.getFullYear();
      const month = String(eventDate.getMonth() + 1).padStart(2, '0');
      const day = String(eventDate.getDate()).padStart(2, '0');
      const localDate = `${year}-${month}-${day}`;

      const { data: eventId, error: eventErr } = await supabase.rpc(
        'find_or_create_event',
        {
          p_url: url.trim() || null,
          p_title: title.trim() || null,
          p_description: description.trim() || null,
          p_image_url: imageUrl.trim() || null,
          p_event_date: localDate,
          p_event_time: timeStr,
        }
      );

      if (eventErr) throw eventErr;
      if (!eventId) throw new Error('Failed to create event');

      const { error: ueErr } = await supabase
        .from('user_events')
        .update({ event_id: eventId })
        .eq('id', params.userEventId)
        .eq('user_id', session.user.id);

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
            .eq('event_id', eventId)
            .single();
          if (findErr || !existingUe) {
            throw findErr ?? new Error('Failed to find the existing event copy');
          }

          const [{ data: targetShares }, { data: sourceShares }] = await Promise.all([
            supabase
              .from('event_shares')
              .select('person_id')
              .eq('user_event_id', existingUe.id),
            supabase
              .from('event_shares')
              .select('person_id')
              .eq('user_event_id', params.userEventId),
          ]);

          const alreadyShared = new Set((targetShares ?? []).map((s) => s.person_id));
          const toMove = (sourceShares ?? [])
            .map((s) => s.person_id)
            .filter((pid) => !alreadyShared.has(pid));

          if (toMove.length > 0) {
            const { error: moveErr } = await supabase.from('event_shares').insert(
              toMove.map((person_id) => ({
                user_event_id: existingUe.id,
                person_id,
              }))
            );
            if (moveErr) throw moveErr;
          }

          const { error: delErr } = await supabase
            .from('user_events')
            .delete()
            .eq('id', params.userEventId);

          if (delErr) throw delErr;
        } else {
          throw ueErr;
        }
      }

      router.replace(`/(app)/event/${eventId}`);
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
          const { error } = await supabase
            .from('user_events')
            .delete()
            .eq('id', params.userEventId)
            .eq('user_id', session?.user?.id ?? '');

          if (error) {
            console.error('Failed to remove event:', error);
            showAlert('Error', 'Failed to remove event');
            setLoading(false);
          } else {
            router.replace('/(app)/');
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
        <TouchableOpacity onPress={load} activeOpacity={0.6}>
          <Text style={[styles.retry, { color: theme.linkText }]}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
          <Text style={[styles.retry, { color: theme.textSecondary }]}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.textPrimary} />
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
          disabled={loading || (!title.trim() && !url.trim())}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading || (!title.trim() && !url.trim()) }}
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
        >
          <Text style={[styles.deleteButtonText, { color: theme.destructiveText }]}>Remove Event</Text>
        </TouchableOpacity>
        </View>
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
