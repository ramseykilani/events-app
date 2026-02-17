import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase';
import { showError } from '../../lib/showError';
import { useSession } from '../context/SessionContext';

export default function AddEventScreen() {
  const { session } = useSession();
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

  const checkExistingEvents = async (): Promise<{ id: string; title: string | null; event_date: string }[] | null> => {
    if (!url.trim()) return null;
    const { data } = await supabase
      .from('events')
      .select('id, title, event_date')
      .eq('url', url.trim())
      .limit(5);
    return data ?? [];
  };

  const chooseExistingEvent = async (
    existing: { id: string; title: string | null; event_date: string }[]
  ): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      const options = existing.slice(0, 3).map((event) => ({
        text: `${event.title ?? 'Untitled'} (${event.event_date})`,
        onPress: () => resolve(event.id),
      }));
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
      Alert.alert('Required', 'Enter a title or URL.');
      return;
    }

    if (!session?.user?.id) return;

    if (url.trim()) {
      const existing = await checkExistingEvents();
      if (existing && existing.length > 0) {
        const eventId = await chooseExistingEvent(existing);
        if (eventId) {
          let userEventId: string | null = null;
          const { data: inserted, error: ueErr } = await supabase
            .from('user_events')
            .insert({
              user_id: session.user.id,
              event_id: eventId,
            })
            .select('id')
            .single();

          // If the user already has this event, reuse that ownership row.
          if (ueErr && ueErr.code !== '23505') {
            showError('Error', ueErr);
            return;
          }

          userEventId = inserted?.id ?? null;
          if (!userEventId) {
            const { data: existingUserEvent, error: fetchErr } = await supabase
              .from('user_events')
              .select('id')
              .eq('user_id', session.user.id)
              .eq('event_id', eventId)
              .single();

            if (fetchErr || !existingUserEvent?.id) {
              showError('Error', fetchErr ?? new Error('Failed to prepare sharing'));
              return;
            }
            userEventId = existingUserEvent.id;
          }

          router.replace({
            pathname: '/(app)/share',
            params: { eventId, userEventId },
          });
          return;
        }
      }
    }

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

      const { data: insertedUserEvent, error: ueErr } = await supabase
        .from('user_events')
        .insert({
          user_id: session.user.id,
          event_id: eventId,
        })
        .select('id')
        .single();

      // Ignore duplicate user_event (user already has this event)
      if (ueErr && ueErr.code !== '23505') throw ueErr;

      let userEventId = insertedUserEvent?.id ?? null;
      if (!userEventId) {
        const { data: existingUserEvent, error: fetchErr } = await supabase
          .from('user_events')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('event_id', eventId)
          .single();
        if (fetchErr || !existingUserEvent?.id) {
          throw fetchErr ?? new Error('Failed to prepare sharing');
        }
        userEventId = existingUserEvent.id;
      }

      router.replace({
        pathname: '/(app)/share',
        params: { eventId, userEventId },
      });
    } catch (err: unknown) {
      showError('Error', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Add event</Text>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={loading || (!title.trim() && !url.trim())}
        >
          <Text
            style={[
              styles.save,
              (loading || (!title.trim() && !url.trim())) && styles.saveDisabled,
            ]}
          >
            Save
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.form}>
        <Text style={styles.label}>URL (optional)</Text>
        <View style={styles.urlRow}>
          <TextInput
            style={styles.input}
            placeholder="https://..."
            placeholderTextColor="#999"
            value={url}
            onChangeText={setUrl}
            onBlur={fetchOgMetadata}
            keyboardType="url"
            autoCapitalize="none"
          />
          {loadingOg && <ActivityIndicator size="small" />}
        </View>
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          placeholder="Event title"
          placeholderTextColor="#999"
          value={title}
          onChangeText={setTitle}
        />
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Description"
          placeholderTextColor="#999"
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <Text style={styles.label}>Date</Text>
        <TouchableOpacity
          style={styles.input}
          onPress={() => setShowDatePicker(true)}
        >
          <Text>{eventDate.toLocaleDateString()}</Text>
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
        <Text style={styles.label}>Time (optional)</Text>
        <TouchableOpacity
          style={styles.input}
          onPress={() => setShowTimePicker(true)}
        >
          <Text>
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
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  cancel: {
    fontSize: 16,
    color: '#666',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  save: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveDisabled: {
    color: '#999',
  },
  form: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
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
