import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useSession } from '../../context/SessionContext';
import type { Event } from '../../../lib/types';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [event, setEvent] = useState<Event | null>(null);
  const [userEventId, setUserEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    async function load() {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Failed to load event:', error);
        setEvent(null);
      } else {
        setEvent(data as Event);
      }

      if (session?.user?.id) {
        const { data: ue } = await supabase
          .from('user_events')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('event_id', id)
          .single();
        setUserEventId(ue?.id ?? null);
      }
      setLoading(false);
    }

    load();
  }, [id, session?.user?.id]);

  const handleShare = () => {
    router.push({
      pathname: '/(app)/share',
      params: { eventId: id },
    });
  };

  const timeStr = event?.event_time
    ? new Date(`1970-01-01T${event.event_time}`).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  if (loading || !event) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>
          {loading ? 'Loading...' : 'Event not found'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {event.image_url ? (
        <Image
          source={{ uri: event.image_url }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.imagePlaceholder} />
      )}
      <View style={styles.content}>
        <Text style={styles.title}>{event.title ?? 'Untitled event'}</Text>
        <Text style={styles.meta}>
          {event.event_date}
          {timeStr ? ` · ${timeStr}` : ''}
        </Text>
        {event.description ? (
          <Text style={styles.description}>{event.description}</Text>
        ) : null}
        {event.url ? (
          <TouchableOpacity
            style={styles.link}
            onPress={() => Linking.openURL(event.url!)}
          >
            <Text style={styles.linkText}>Open link</Text>
          </TouchableOpacity>
        ) : null}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareButtonText}>Share</Text>
          </TouchableOpacity>
          {userEventId && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() =>
                router.push({
                  pathname: '/(app)/edit-event',
                  params: { eventId: id, userEventId },
                })
              }
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loading: {
    padding: 24,
    fontSize: 16,
  },
  image: {
    width: '100%',
    height: 200,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#e0e0e0',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  meta: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  link: {
    marginBottom: 24,
  },
  linkText: {
    fontSize: 16,
    color: '#0066cc',
    textDecorationLine: 'underline',
  },
  actions: {
    gap: 12,
  },
  shareButton: {
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  editButton: {
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
});
