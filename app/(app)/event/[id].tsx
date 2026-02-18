import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useSession } from '../../context/SessionContext';
import type { Event } from '../../../lib/types';

type SharedWithPerson = {
  id: string;
  contact_name: string | null;
  phone_number: string;
};

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [event, setEvent] = useState<Event | null>(null);
  const [userEventId, setUserEventId] = useState<string | null>(null);
  const [sharedWith, setSharedWith] = useState<SharedWithPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessRevoked, setAccessRevoked] = useState(false);

  useEffect(() => {
    if (!id) return;

    async function load() {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          setAccessRevoked(true);
        } else {
          console.error('Failed to load event:', error);
        }
        setEvent(null);
      } else {
        setEvent(data as Event);
        setAccessRevoked(false);
      }

      if (session?.user?.id) {
        const { data: ue } = await supabase
          .from('user_events')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('event_id', id)
          .single();
        setUserEventId(ue?.id ?? null);

        if (ue?.id) {
          const { data: shares } = await supabase
            .from('event_shares')
            .select('person_id')
            .eq('user_event_id', ue.id);
          const personIds = (shares ?? []).map((s) => s.person_id);
          if (personIds.length > 0) {
            const { data: people } = await supabase
              .from('my_people')
              .select('id, contact_name, phone_number')
              .in('id', personIds);
            setSharedWith((people ?? []) as SharedWithPerson[]);
          } else {
            setSharedWith([]);
          }
        }
      }
      setLoading(false);
    }

    load();
  }, [id, session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!userEventId) return;
      async function refreshSharedWith() {
        const { data: shares } = await supabase
          .from('event_shares')
          .select('person_id')
          .eq('user_event_id', userEventId);
        const personIds = (shares ?? []).map((s) => s.person_id);
        if (personIds.length > 0) {
          const { data: people } = await supabase
            .from('my_people')
            .select('id, contact_name, phone_number')
            .in('id', personIds);
          setSharedWith((people ?? []) as SharedWithPerson[]);
        } else {
          setSharedWith([]);
        }
      }
      refreshSharedWith();
    }, [userEventId])
  );

  const handleShare = () => {
    router.push({
      pathname: '/(app)/share',
      params: {
        eventId: id,
        ...(userEventId ? { userEventId } : {}),
      },
    });
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
            const { error } = await supabase.from('events').delete().eq('id', id);

            if (error) {
              console.error('Failed to delete event:', error);
              Alert.alert('Error', 'Failed to delete event');
              setLoading(false);
            } else {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(app)/');
              }
            }
          },
        },
      ]
    );
  };

  const timeStr = event?.event_time
    ? new Date(`1970-01-01T${event.event_time}`).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (accessRevoked) {
    return (
      <View style={styles.container}>
        <View style={styles.revokedContainer}>
          <Text style={styles.revokedTitle}>Access removed</Text>
          <Text style={styles.revokedMessage}>
            You no longer have access to this event. The person who shared it may
            have removed you from their contacts.
          </Text>
        </View>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Event not found</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.innerContent}>
          {event.image_url ? (
            <Image
              source={{ uri: event.image_url }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : null}
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
          {userEventId && sharedWith.length > 0 ? (
            <View style={styles.sharedWithSection}>
              <Text style={styles.sharedWithTitle}>Shared with</Text>
              {sharedWith.map((p) => (
                <Text key={p.id} style={styles.sharedWithItem}>
                  {p.contact_name ?? p.phone_number}
                </Text>
              ))}
              <Text style={styles.sharedWithNote}>
                Removing someone from My People also removes them from this
                event.
              </Text>
            </View>
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
            {event.created_by_user_id === session?.user?.id && (
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Text style={styles.deleteButtonText}>Delete Event</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  innerContent: {
    padding: 24,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    alignItems: 'center',
  },
  loading: {
    padding: 24,
    fontSize: 16,
  },
  image: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  meta: {
    fontSize: 18,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  description: {
    fontSize: 18,
    lineHeight: 28,
    marginBottom: 24,
    textAlign: 'center',
  },
  link: {
    marginBottom: 32,
  },
  linkText: {
    fontSize: 18,
    color: '#0066cc',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  sharedWithSection: {
    width: '100%',
    marginBottom: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    alignSelf: 'center',
  },
  sharedWithTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  sharedWithItem: {
    fontSize: 16,
    marginBottom: 4,
  },
  sharedWithNote: {
    fontSize: 12,
    color: '#999',
    marginTop: 12,
    fontStyle: 'italic',
  },
  revokedContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  revokedTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  revokedMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    gap: 16,
    width: '100%',
    maxWidth: 400,
  },
  shareButton: {
    backgroundColor: '#000',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  editButton: {
    backgroundColor: '#f0f0f0',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 20,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#fee2e2',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  deleteButtonText: {
    color: '#dc2626',
    fontSize: 20,
    fontWeight: '600',
  },
});
