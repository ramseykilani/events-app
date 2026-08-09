import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { showError } from '../../../lib/showError';
import { formatEventDate, formatPhoneDisplay } from '../../../lib/format';
import { useSession } from '../../_context/SessionContext';
import type { Event } from '../../../lib/types';
import { useTheme } from '../../../hooks/useTheme';

type SharedWithPerson = {
  id: string;
  contact_name: string | null;
  phone_number: string;
};

export default function EventDetailScreen() {
  const { id, sharedByPersonId } = useLocalSearchParams<{ id: string; sharedByPersonId?: string }>();
  const { session } = useSession();
  const theme = useTheme();
  const [event, setEvent] = useState<Event | null>(null);
  const [userEventId, setUserEventId] = useState<string | null>(null);
  const [sharedWith, setSharedWith] = useState<SharedWithPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [sharerName, setSharerName] = useState<string | null>(null);
  const [isHidden, setIsHidden] = useState(false);

  const load = useCallback(async () => {
    if (!id || !session?.user?.id) return;

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        setAccessRevoked(true);
        setLoadError(false);
      } else {
        console.error('Failed to load event:', error);
        setLoadError(true);
      }
      setEvent(null);
    } else {
      setEvent(data as Event);
      setAccessRevoked(false);
      setLoadError(false);
    }

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
    } else {
      setSharedWith([]);
    }

    if (sharedByPersonId) {
      const { data: person } = await supabase
        .from('my_people')
        .select('contact_name, phone_number')
        .eq('id', sharedByPersonId)
        .single();
      setSharerName(person?.contact_name ?? person?.phone_number ?? null);

      const { data: hidden } = await supabase
        .from('hidden_people')
        .select('id')
        .eq('owner_id', session.user.id)
        .eq('person_id', sharedByPersonId)
        .maybeSingle();
      setIsHidden(!!hidden);
    }
    setLoading(false);
  }, [id, session?.user?.id, sharedByPersonId]);

  // useFocusEffect (not useEffect) so returning from Edit shows the new
  // snapshot without remounting.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
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
    if (!userEventId) return;
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
            .eq('id', userEventId)
            .eq('user_id', session?.user?.id ?? '');

          if (error) {
            console.error('Failed to remove event:', error);
            showAlert('Error', 'Failed to remove event');
            setLoading(false);
          } else {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(app)/');
            }
          }
        },
      }
    );
  };

  const handleToggleHide = async () => {
    if (!sharedByPersonId || !session?.user?.id) return;
    if (isHidden) {
      const { error } = await supabase
        .from('hidden_people')
        .delete()
        .eq('owner_id', session.user.id)
        .eq('person_id', sharedByPersonId);
      if (error) {
        showError('Error', error);
        return;
      }
      setIsHidden(false);
    } else {
      const { error } = await supabase.from('hidden_people').insert({
        owner_id: session.user.id,
        person_id: sharedByPersonId,
      });
      if (error) {
        // Stay put so the user can retry instead of silently navigating back
        showError('Error', error);
        return;
      }
      setIsHidden(true);
      router.back();
    }
  };

  const timeStr = event?.event_time
    ? new Date(`1970-01-01T${event.event_time}`).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.textPrimary} />
      </View>
    );
  }

  if (accessRevoked) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6} accessibilityRole="button">
            <Text style={[styles.navBack, { color: theme.textSecondary }]}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.revokedContainer}>
          <Text style={[styles.revokedTitle, { color: theme.textPrimary }]}>Access removed</Text>
          <Text style={[styles.revokedMessage, { color: theme.textSecondary }]}>
            You no longer have access to this event. The person who shared it may
            have removed you from their contacts.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6} accessibilityRole="button">
            <Text style={[styles.navBack, { color: theme.textSecondary }]}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.revokedContainer}>
          <Text style={[styles.revokedMessage, { color: theme.textSecondary }]}>
            Could not load this event.
          </Text>
          <TouchableOpacity onPress={load} activeOpacity={0.6} accessibilityRole="button">
            <Text style={[styles.navBack, { color: theme.linkText }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6} accessibilityRole="button">
            <Text style={[styles.navBack, { color: theme.textSecondary }]}>Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.loading, { color: theme.textPrimary }]}>Event not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6} accessibilityRole="button">
          <Text style={[styles.navBack, { color: theme.textSecondary }]}>Back</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.innerContent}>
          {event.image_url ? (
            <Image
              source={{ uri: event.image_url }}
              style={styles.image}
              resizeMode="cover"
              accessibilityLabel={event.title ? `${event.title} image` : 'Event image'}
            />
          ) : null}
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
            {event.title ?? 'Untitled event'}
          </Text>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {formatEventDate(event.event_date)}
            {timeStr ? ` · ${timeStr}` : ''}
          </Text>
          {event.description ? (
            <Text style={[styles.description, { color: theme.textPrimary }]}>{event.description}</Text>
          ) : null}
          {event.url ? (
            <TouchableOpacity
              style={styles.link}
              onPress={() => Linking.openURL(event.url!)}
              activeOpacity={0.6}
              accessibilityRole="button"
            >
              <Text style={[styles.linkText, { color: theme.linkText }]}>Open link</Text>
            </TouchableOpacity>
          ) : null}
          {userEventId && sharedWith.length > 0 ? (
            <View style={[styles.sharedWithSection, { backgroundColor: theme.surface }]}>
              <Text style={[styles.sharedWithTitle, { color: theme.textSecondary }]}>Shared with</Text>
              {sharedWith.map((p) => (
                <Text key={p.id} style={[styles.sharedWithItem, { color: theme.textPrimary }]}>
                  {p.contact_name ?? formatPhoneDisplay(p.phone_number)}
                </Text>
              ))}
              <Text style={[styles.sharedWithNote, { color: theme.textTertiary }]}>
                Sharing delivers everyone their own copy — it can't be unsent.
              </Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.shareButton, { backgroundColor: theme.primaryButtonBg }]} onPress={handleShare} activeOpacity={0.7} accessibilityRole="button">
              <Text style={[styles.shareButtonText, { color: theme.primaryButtonText }]}>Share</Text>
            </TouchableOpacity>
            {userEventId && (
              <TouchableOpacity
                style={[styles.editButton, { backgroundColor: theme.surfaceSecondary }]}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/edit-event',
                    params: { eventId: id, userEventId },
                  })
                }
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.editButtonText, { color: theme.textPrimary }]}>Edit</Text>
              </TouchableOpacity>
            )}
            {userEventId && (
              <TouchableOpacity
                style={[styles.deleteButton, { backgroundColor: theme.destructiveBg }]}
                onPress={handleDelete}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.deleteButtonText, { color: theme.destructiveText }]}>Remove Event</Text>
              </TouchableOpacity>
            )}
            {sharedByPersonId && (
              <TouchableOpacity
                style={[styles.hideButton, { backgroundColor: theme.surfaceSecondary }]}
                onPress={handleToggleHide}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.hideButtonText, { color: theme.textSecondary }]}>
                  {isHidden
                    ? `Unhide ${sharerName ?? 'this person'}`
                    : `Hide ${sharerName ?? 'this person'}`}
                </Text>
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
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
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
  navRow: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  navBack: {
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
    marginBottom: 8,
    textAlign: 'center',
  },
  meta: {
    fontSize: 18,
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
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  sharedWithSection: {
    width: '100%',
    marginBottom: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignSelf: 'center',
  },
  sharedWithTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  sharedWithItem: {
    fontSize: 16,
    marginBottom: 4,
  },
  sharedWithNote: {
    fontSize: 12,
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
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    gap: 16,
    width: '100%',
    maxWidth: 400,
  },
  shareButton: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  shareButtonText: {
    fontSize: 20,
    fontWeight: '600',
  },
  editButton: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 20,
    fontWeight: '600',
  },
  deleteButton: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  deleteButtonText: {
    fontSize: 20,
    fontWeight: '600',
  },
  hideButton: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  hideButtonText: {
    fontSize: 20,
    fontWeight: '600',
  },
});
