import { useState, useCallback, useRef } from 'react';
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
import { formatEventDate, formatPhoneDisplay } from '../../../lib/format';
import { useSession } from '../../_context/SessionContext';
import type { Event } from '../../../lib/types';
import { useTheme } from '../../../hooks/useTheme';
import {
  eventFromPreview,
  previewFromEvent,
  readEventPreview,
  rememberEventPreview,
} from '../../../lib/eventPreviewCache';
import { isAbortError, withRetries, withWriteTimeout } from '../../../lib/timeoutSignal';

type SharedWithPerson = {
  id: string;
  contact_name: string | null;
  phone_number: string;
};

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function EventDetailScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    userEventId?: string | string[];
    sharedByPersonId?: string | string[];
  }>();
  const id = firstParam(params.id);
  const paramUserEventId = firstParam(params.userEventId);
  const sharedByPersonId = firstParam(params.sharedByPersonId);
  const preview = id ? readEventPreview(id) : undefined;
  const seeded = preview ? eventFromPreview(preview) : null;

  const { session } = useSession();
  const theme = useTheme();
  const [event, setEvent] = useState<Event | null>(seeded);
  const [userEventId, setUserEventId] = useState<string | null>(
    paramUserEventId ?? preview?.userEventId ?? null
  );
  const [sharedWith, setSharedWith] = useState<SharedWithPerson[]>([]);
  const [loading, setLoading] = useState(!seeded);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [sharerName, setSharerName] = useState<string | null>(
    preview?.sharer_contact_name ?? null
  );
  const [isHidden, setIsHidden] = useState(false);
  const loadSeq = useRef(0);
  const hasContentRef = useRef(!!seeded);
  const writeInFlightRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;

    if (!id || !session?.user?.id) {
      setAccessRevoked(false);
      setLoadError(true);
      setLoading(false);
      if (!hasContentRef.current) setEvent(null);
      return;
    }

    if (!hasContentRef.current) setLoading(true);

    try {
      const result = await withRetries(async (signal) => {
        const eventQuery = supabase
          .from('events')
          .select('*')
          .eq('id', id)
          .abortSignal(signal)
          .single();

        const ueQuery = paramUserEventId
          ? Promise.resolve({ data: { id: paramUserEventId }, error: null })
          : supabase
              .from('user_events')
              .select('id')
              .eq('user_id', session.user.id)
              .eq('event_id', id)
              .abortSignal(signal)
              .single();

        const [{ data, error }, { data: ue }] = await Promise.all([
          eventQuery,
          ueQuery,
        ]);

        if (error) {
          if (error.code === 'PGRST116') {
            return { kind: 'revoked' as const };
          }
          throw error;
        }

        const ueId = ue?.id ?? paramUserEventId ?? null;
        let nextShared: SharedWithPerson[] = [];
        if (ueId) {
          const { data: shares } = await supabase
            .from('event_shares')
            .select('person_id')
            .eq('user_event_id', ueId)
            .abortSignal(signal);
          const personIds = (shares ?? []).map((s) => s.person_id);
          if (personIds.length > 0) {
            const { data: people } = await supabase
              .from('my_people')
              .select('id, contact_name, phone_number')
              .in('id', personIds)
              .abortSignal(signal);
            nextShared = (people ?? []) as SharedWithPerson[];
          }
        }

        let nextSharer = null as string | null;
        let nextHidden = false;
        if (sharedByPersonId) {
          const [{ data: person }, { data: hidden }] = await Promise.all([
            supabase
              .from('my_people')
              .select('contact_name, phone_number')
              .eq('id', sharedByPersonId)
              .abortSignal(signal)
              .single(),
            supabase
              .from('hidden_people')
              .select('id')
              .eq('owner_id', session.user.id)
              .eq('person_id', sharedByPersonId)
              .abortSignal(signal)
              .maybeSingle(),
          ]);
          nextSharer = person?.contact_name ?? person?.phone_number ?? null;
          nextHidden = !!hidden;
        }

        return {
          kind: 'ok' as const,
          event: data as Event,
          userEventId: ueId,
          sharedWith: nextShared,
          sharerName: nextSharer,
          isHidden: nextHidden,
        };
      });

      if (seq !== loadSeq.current) return;

      if (result.kind === 'revoked') {
        hasContentRef.current = false;
        setEvent(null);
        setAccessRevoked(true);
        setLoadError(false);
        return;
      }

      hasContentRef.current = true;
      setEvent(result.event);
      setUserEventId(result.userEventId);
      setSharedWith(result.sharedWith);
      if (result.sharerName !== null) setSharerName(result.sharerName);
      setIsHidden(result.isHidden);
      setAccessRevoked(false);
      setLoadError(false);
      rememberEventPreview(previewFromEvent(result.event, result.userEventId));
    } catch (err) {
      if (seq !== loadSeq.current) return;
      console.error('Failed to load event:', err);
      setAccessRevoked(false);
      setLoadError(true);
      if (!hasContentRef.current) setEvent(null);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [id, session?.user?.id, sharedByPersonId, paramUserEventId]);

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

  const handleEdit = () => {
    if (!id || !userEventId || !event) return;
    rememberEventPreview(previewFromEvent(event, userEventId));
    router.push({
      pathname: '/(app)/edit-event',
      params: { eventId: id, userEventId },
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
          if (writeInFlightRef.current) return;
          writeInFlightRef.current = true;
          setLoading(true);
          try {
            await withWriteTimeout(async (signal) => {
              const { error } = await supabase
                .from('user_events')
                .delete()
                .eq('id', userEventId)
                .eq('user_id', session?.user?.id ?? '')
                .abortSignal(signal);

              if (error) throw error;
            });
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(app)/');
            }
          } catch (err) {
            console.error('Failed to remove event:', err);
            showAlert('Error', 'Failed to remove event');
          } finally {
            writeInFlightRef.current = false;
            setLoading(false);
          }
        },
      }
    );
  };

  const handleToggleHide = async () => {
    if (!sharedByPersonId || !session?.user?.id) return;
    if (writeInFlightRef.current) return;
    writeInFlightRef.current = true;
    try {
      await withWriteTimeout(async (signal) => {
        if (isHidden) {
          const { error } = await supabase
            .from('hidden_people')
            .delete()
            .eq('owner_id', session.user.id)
            .eq('person_id', sharedByPersonId)
            .abortSignal(signal);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('hidden_people')
            .insert({
              owner_id: session.user.id,
              person_id: sharedByPersonId,
            })
            .abortSignal(signal);
          if (error) throw error;
        }
      });
    } catch (err) {
      console.error('Failed to update hidden people:', err);
      showAlert(
        'Could not update',
        isAbortError(err)
          ? 'That took too long. Check your connection and try again.'
          : 'Something went wrong. Try again.'
      );
      return;
    } finally {
      writeInFlightRef.current = false;
    }
    if (isHidden) {
      setIsHidden(false);
    } else {
      setIsHidden(true);
      router.back();
    }
  };

  const handleRetry = () => {
    setLoadError(false);
    if (!hasContentRef.current) setLoading(true);
    void load();
  };

  const timeStr = event?.event_time
    ? new Date(`1970-01-01T${event.event_time}`).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  const navBack = (
    <View style={styles.navRow}>
      <TouchableOpacity
        onPress={() => router.back()}
        activeOpacity={0.6}
        accessibilityRole="button"
        // hitSlop (not padding): this screen has a pixel-diff baseline.
        hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
      >
        <Text style={[styles.navBack, { color: theme.textSecondary }]}>Back</Text>
      </TouchableOpacity>
    </View>
  );

  if (accessRevoked) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        {navBack}
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

  if (!event) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        {navBack}
        <View style={styles.revokedContainer}>
          {loading ? (
            <ActivityIndicator color={theme.textPrimary} />
          ) : (
            <>
              <Text style={[styles.revokedMessage, { color: theme.textSecondary }]}>
                {loadError ? 'Could not load this event.' : 'Event not found'}
              </Text>
              {loadError ? (
                <TouchableOpacity
                  onPress={handleRetry}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
                >
                  <Text style={[styles.navBack, { color: theme.linkText }]}>Retry</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {navBack}
      {loadError ? (
        <TouchableOpacity
          style={[styles.refreshBanner, { backgroundColor: theme.surface }]}
          onPress={handleRetry}
          activeOpacity={0.6}
          accessibilityRole="button"
        >
          <Text style={[styles.refreshBannerText, { color: theme.textPrimary }]}>
            Could not refresh. Retry
          </Text>
        </TouchableOpacity>
      ) : null}
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
                onPress={handleEdit}
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
  refreshBanner: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  refreshBannerText: {
    fontSize: 14,
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
    gap: 16,
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
