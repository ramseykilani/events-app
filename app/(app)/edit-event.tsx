import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase';
import { showError } from '../../lib/showError';
import { useSession } from '../_context/SessionContext';
import type { Event } from '../../lib/types';
import { useTheme } from '../../hooks/useTheme';

export default function EditEventScreen() {
  const params = useLocalSearchParams<{ eventId: string; userEventId: string }>();
  const { session } = useSession();
  const theme = useTheme();
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

  useEffect(() => {
    if (!params.eventId) return;

    async function load() {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', params.eventId)
        .single();

      if (error) {
        console.error('Failed to load event:', error);
        return;
      }

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
    }

    load();
  }, [params.eventId]);

  const handleSave = async () => {
    if (!title.trim() && !url.trim()) {
      Alert.alert('Required', 'Enter a title or URL.');
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
        // If update fails because user already has this event (duplicate user_event),
        // delete the current user_event and switch to the existing one.
        if (ueErr.code === '23505') {
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
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            const { error } = await supabase
              .from('events')
              .delete()
              .eq('id', params.eventId);

            if (error) {
              console.error('Failed to delete event:', error);
              Alert.alert('Error', 'Failed to delete event');
              setLoading(false);
            } else {
              router.replace('/(app)/');
            }
          },
        },
      ]
    );
  };

  if (!event) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.loading, { color: theme.textPrimary }]}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancel, { color: theme.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Edit event</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={loading || (!title.trim() && !url.trim())}
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
        <TouchableOpacity
          style={[styles.input, { borderColor: theme.border }]}
          onPress={() => setShowDatePicker(true)}
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
        <Text style={[styles.label, { color: theme.textSecondary }]}>Time (optional)</Text>
        <TouchableOpacity
          style={[styles.input, { borderColor: theme.border }]}
          onPress={() => setShowTimePicker(true)}
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
        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: theme.destructiveBg }]}
          onPress={handleDelete}
        >
          <Text style={[styles.deleteButtonText, { color: theme.destructiveText }]}>Delete Event</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    padding: 24,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 48,
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
