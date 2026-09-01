import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ScrollView,
  ActivityIndicator,
  AccessibilityInfo,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { addToGoogle, addToOtherCalendar } from '../../../lib/addToCalendar';
import { formatEventDate, formatPhoneDisplay, localDateString } from '../../../lib/format';
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
  // Who's Coming: this person's answer to the share. NULL = hasn't said.
  response: 'yes' | 'no' | null;
};

// The recipient's own answer slot on a received event (Who's Coming), from
// the get_my_send_response RPC. NULL replyTo = nothing to answer (a
// self-created row, or the send is gone) — no widget renders.
type ReplyState = {
  response: 'yes' | 'no' | null;
  sharerName: string | null;
};

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// The answer-save confirmation (design-language §6 → Confirmation feedback):
// appears on every successful write and stays until the screen unmounts —
// nothing auto-dismisses. The parent keys it by the save timestamp so a
// re-tap re-mounts and re-runs the fade, re-asserting the confirmation.
function SavedLine({
  textColor,
  accentColor,
}: {
  textColor: string;
  accentColor: string;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [opacity]);
  return (
    <Animated.Text
      style={[styles.replyStatus, { color: textColor, opacity }]}
      accessibilityLiveRegion="polite"
    >
      <Text style={{ color: accentColor }}>✓</Text> Saved.
    </Animated.Text>
  );
}

export default function EventDetailScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    sharedByPersonId?: string | string[];
  }>();
  const id = firstParam(params.id);
  const sharedByPersonId = firstParam(params.sharedByPersonId);
  const preview = id ? readEventPreview(id) : undefined;
  const seeded = preview ? eventFromPreview(preview) : null;

  const { session } = useSession();
  const theme = useTheme();
  const [event, setEvent] = useState<Event | null>(seeded);
  const [sharedWith, setSharedWith] = useState<SharedWithPerson[]>([]);
  const [loading, setLoading] = useState(!seeded);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [sharerName, setSharerName] = useState<string | null>(
    preview?.sharer_contact_name ?? null
  );
  const [isHidden, setIsHidden] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyState | null>(null);
  // Who's Coming save feedback: `responding` drives the in-flight spinner on
  // the tapped button; `savedAt` gates the "✓ Saved." line, which persists
  // for the screen's mount lifetime (a fresh mount shows state only).
  const [responding, setResponding] = useState<'yes' | 'no' | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
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
        // Resolution chain (Copy + Follow ids are owner-scoped):
        // 1. the caller's own row with this id (calendar taps and
        //    post-cutover notification taps land here — RLS returns a row
        //    only when the caller owns it);
        // 2. the caller's copy of a followed sender's row (taps carrying the
        //    sender's row id — future deep links, sender-perspective
        //    payloads);
        // 3. nothing → the access-revoked UI.
        const { data: own, error: ownErr } = await supabase
          .from('events')
          .select('*')
          .eq('id', id)
          .abortSignal(signal)
          .maybeSingle();
        if (ownErr) throw ownErr;

        let row = own as Event | null;
        if (!row) {
          const { data: copy, error: copyErr } = await supabase
            .from('events')
            .select('*')
            .eq('from_event_id', id)
            .abortSignal(signal)
            .maybeSingle();
          if (copyErr) throw copyErr;
          row = copy as Event | null;
        }

        if (!row) return { kind: 'revoked' as const };

        let nextShared: SharedWithPerson[] = [];
        const { data: sends } = await supabase
          .from('sends')
          .select('person_id, response')
          .eq('event_id', row.id)
          .abortSignal(signal);
        const personIds = (sends ?? []).map((s) => s.person_id);
        if (personIds.length > 0) {
          const { data: people } = await supabase
            .from('my_people')
            .select('id, contact_name, phone_number')
            .in('id', personIds)
            .abortSignal(signal);
          const responseByPerson = new Map(
            (sends ?? []).map((s) => [s.person_id, s.response] as const)
          );
          nextShared = ((people ?? []) as Omit<SharedWithPerson, 'response'>[]).map(
            (p) => ({ ...p, response: responseByPerson.get(p.id) ?? null })
          );
        }

        // Who's Coming: a received row (from_event_id set) may be answerable.
        // The RPC returns one row when a send exists for the caller (response
        // NULL = not answered yet) and zero rows when there is nothing to
        // answer — self-created rows never reach the RPC.
        let nextReply: ReplyState | null = null;
        if (row.from_event_id) {
          const { data: replyRows, error: replyErr } = await supabase
            .rpc('get_my_send_response', { p_event_id: row.id })
            .abortSignal(signal);
          if (replyErr) throw replyErr;
          const reply = (
            replyRows as { response: 'yes' | 'no' | null; sharer_name: string | null }[] | null
          )?.[0];
          if (reply) {
            nextReply = { response: reply.response, sharerName: reply.sharer_name };
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
          event: row,
          sharedWith: nextShared,
          sharerName: nextSharer,
          isHidden: nextHidden,
          replyTo: nextReply,
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
      setSharedWith(result.sharedWith);
      if (result.sharerName !== null) setSharerName(result.sharerName);
      setIsHidden(result.isHidden);
      setReplyTo(result.replyTo);
      setAccessRevoked(false);
      setLoadError(false);
      rememberEventPreview(previewFromEvent(result.event));
    } catch (err) {
      if (seq !== loadSeq.current) return;
      console.error('Failed to load event:', err);
      setAccessRevoked(false);
      setLoadError(true);
      if (!hasContentRef.current) setEvent(null);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [id, session?.user?.id, sharedByPersonId]);

  // useFocusEffect (not useEffect) so returning from Edit shows the new
  // snapshot without remounting.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleShare = () => {
    if (!event) return;
    router.push({
      pathname: '/(app)/share',
      params: { eventId: event.id },
    });
  };

  const handleEdit = () => {
    if (!event) return;
    rememberEventPreview(previewFromEvent(event));
    router.push({
      pathname: '/(app)/edit-event',
      params: { eventId: event.id },
    });
  };

  // Add to Other Calendars: one-shot snapshot export (FEATURES.md) — the
  // external calendar gets a copy; later in-app edits do not reach it.
  const handleAddToGoogle = async () => {
    if (!event) return;
    try {
      await addToGoogle(event);
    } catch (err) {
      console.error('Failed to open Google Calendar:', err);
      showAlert('Could not open', 'Something went wrong. Try again.');
    }
  };

  const handleAddToOtherCalendar = async () => {
    if (!event) return;
    try {
      await addToOtherCalendar(event);
    } catch (err) {
      console.error('Failed to add to calendar:', err);
      showAlert('Could not add to calendar', 'Something went wrong. Try again.');
    }
  };

  const handleDelete = () => {
    if (!event) return;
    const rowId = event.id;
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
                .from('events')
                .delete()
                .eq('id', rowId)
                .eq('owner_id', session?.user?.id ?? '')
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

  // Archive Received Events: removing a RECEIVED event is reversible, so
  // there is no confirm dialog — the "Archived" link appearing at the foot
  // of the calendar is the confirmation (design doc §6, structural).
  const handleArchive = () => {
    if (!event) return;
    if (writeInFlightRef.current) return;
    const rowId = event.id;
    const rowDate = event.event_date;
    const answerable = event.from_event_id !== null;
    writeInFlightRef.current = true;
    setLoading(true);
    void (async () => {
      try {
        await withWriteTimeout(async (signal) => {
          const { error } = await supabase
            .rpc('set_event_archived', { p_event_id: rowId, p_archived: true })
            .abortSignal(signal);
          if (error) throw error;
        });
      } catch (err) {
        console.error('Failed to archive event:', err);
        showAlert(
          'Could not archive',
          isAbortError(err)
            ? 'That took too long. Check your connection and try again.'
            : 'Something went wrong. Try again.'
        );
        return;
      } finally {
        writeInFlightRef.current = false;
        setLoading(false);
      }

      const navBack = () => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(app)/');
        }
      };

      // Conditional say-No prompt (owner, 2026-09-01): "get this off my
      // calendar" users never return to the event screen, so the answer
      // rides the archive moment or it never happens. Only an upcoming
      // event with a live send and a NULL/Yes answer asks; past events and
      // an existing No archive silently. The archive stands even if the No
      // write fails — no rollback.
      if (!answerable || rowDate < localDateString(new Date())) {
        navBack();
        return;
      }
      // Resolve the answer slot fresh: a preview-seeded screen can be
      // archived before the focus load answers get_my_send_response, and the
      // prompt must never be skipped by a fast tap. Best-effort — if the
      // read fails, the archive stands and nobody is asked.
      let reply: ReplyState | null = null;
      try {
        reply = await withRetries(async (signal) => {
          const { data, error } = await supabase
            .rpc('get_my_send_response', { p_event_id: rowId })
            .abortSignal(signal);
          if (error) throw error;
          const row = (
            data as { response: 'yes' | 'no' | null; sharer_name: string | null }[] | null
          )?.[0];
          return row ? { response: row.response, sharerName: row.sharer_name } : null;
        });
      } catch (err) {
        console.error('Failed to resolve the answer slot:', err);
      }
      if (reply === null || reply.response === 'no') {
        navBack();
        return;
      }
      const name = reply.sharerName ?? sharerName;
      const who = name ?? 'them';
      showConfirm(
        'Taken off your calendar.',
        reply.response === 'yes'
          ? name
            ? `${name} still has you down as coming — change it to No?`
            : 'They still have you down as coming — change it to No?'
          : `Let ${who} know you're not in?`,
        {
          confirmText: `Tell ${who} no`,
          cancelText: 'Not now',
          onConfirm: async () => {
            try {
              const changed = await withWriteTimeout(async (signal) => {
                const { data, error } = await supabase
                  .rpc('respond_to_send', { p_event_id: rowId, p_response: 'no' })
                  .abortSignal(signal);
                if (error) throw error;
                return data as boolean;
              });
              // Same freshness rules as the widget: the asker is pushed
              // only when the answer actually changed.
              if (changed) {
                supabase.functions
                  .invoke('send-response-notification', { body: { eventId: rowId } })
                  .catch((err) => console.error('send-response-notification error:', err));
              }
            } catch (err) {
              console.error('Failed to save answer:', err);
              showAlert(
                'Could not save',
                isAbortError(err)
                  ? 'That took too long. Check your connection and try again.'
                  : 'Something went wrong. Try again.'
              );
            } finally {
              navBack();
            }
          },
          onCancel: navBack,
        }
      );
    })();
  };

  const handleRestore = async () => {
    if (!event) return;
    if (writeInFlightRef.current) return;
    writeInFlightRef.current = true;
    setLoading(true);
    try {
      await withWriteTimeout(async (signal) => {
        const { error } = await supabase
          .rpc('set_event_archived', { p_event_id: event.id, p_archived: false })
          .abortSignal(signal);
        if (error) throw error;
      });
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(app)/');
      }
    } catch (err) {
      console.error('Failed to restore event:', err);
      showAlert(
        'Could not restore',
        isAbortError(err)
          ? 'That took too long. Check your connection and try again.'
          : 'Something went wrong. Try again.'
      );
    } finally {
      writeInFlightRef.current = false;
      setLoading(false);
    }
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

  // Who's Coming: the recipient's yes/no reply to the person who sent them
  // this event. Last write wins. Re-tapping the current answer round-trips
  // on purpose — the RPC reports changed=false so the asker is never
  // re-pinged, and the re-asserted "Saved." keeps the probe truthful.
  const handleRespond = async (answer: 'yes' | 'no') => {
    if (!event || !replyTo) return;
    if (writeInFlightRef.current) return;
    writeInFlightRef.current = true;
    setResponding(answer);
    try {
      const changed = await withWriteTimeout(async (signal) => {
        const { data, error } = await supabase
          .rpc('respond_to_send', { p_event_id: event.id, p_response: answer })
          .abortSignal(signal);
        if (error) throw error;
        return data as boolean;
      });
      setReplyTo({ ...replyTo, response: answer });
      setSavedAt(Date.now());
      AccessibilityInfo.announceForAccessibility('Saved.');
      // Fire-and-forget, outside the write budget: the asker gets a push
      // only when the answer actually changed (first answer and flips).
      if (changed) {
        supabase.functions
          .invoke('send-response-notification', { body: { eventId: event.id } })
          .catch((err) => console.error('send-response-notification error:', err));
      }
    } catch (err) {
      console.error('Failed to save answer:', err);
      showAlert(
        'Could not save',
        isAbortError(err)
          ? 'That took too long. Check your connection and try again.'
          : 'Something went wrong. Try again.'
      );
    } finally {
      writeInFlightRef.current = false;
      setResponding(null);
    }
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
          <View style={styles.addToCalendarRow}>
            <Text style={[styles.addToCalendarLabel, { color: theme.textSecondary }]}>
              Add to calendar
            </Text>
            <View style={styles.addToCalendarButtons}>
              <TouchableOpacity
                style={[styles.calendarIconButton, { backgroundColor: theme.surfaceSecondary }]}
                onPress={handleAddToGoogle}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Add to Google Calendar"
              >
                <MaterialCommunityIcons name="google" size={20} color={theme.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.calendarIconButton, { backgroundColor: theme.surfaceSecondary }]}
                onPress={handleAddToOtherCalendar}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Add to Apple, Outlook, or another calendar"
              >
                <View style={styles.calendarIconPair}>
                  <MaterialCommunityIcons name="apple" size={16} color={theme.textPrimary} />
                  <MaterialCommunityIcons
                    name="microsoft-outlook"
                    size={16}
                    color={theme.textPrimary}
                  />
                </View>
              </TouchableOpacity>
            </View>
          </View>
          {replyTo ? (
            <View style={[styles.replySection, { backgroundColor: theme.surface }]}>
              <Text style={[styles.replyTitle, { color: theme.textSecondary }]}>
                {replyTo.sharerName ?? sharerName
                  ? `${replyTo.sharerName ?? sharerName} asked — are you in?`
                  : 'Are you in?'}
              </Text>
              <View style={styles.replyButtons}>
                {(['yes', 'no'] as const).map((answer) => {
                  const selected = replyTo.response === answer;
                  return (
                    <TouchableOpacity
                      key={answer}
                      style={[
                        styles.replyButton,
                        {
                          // The selected answer gets the accent fill — the
                          // same selected-state treatment as the calendar's
                          // selected day. selectedBg was too close to
                          // surfaceSecondary to read as feedback.
                          backgroundColor: selected
                            ? theme.calendarSelected
                            : theme.surfaceSecondary,
                        },
                      ]}
                      onPress={() => handleRespond(answer)}
                      activeOpacity={0.7}
                      disabled={responding !== null}
                      accessibilityRole="button"
                      accessibilityLabel={answer === 'yes' ? "Yes, I'm in" : "No, I'm out"}
                      accessibilityState={{ selected, disabled: responding !== null }}
                    >
                      {responding === answer ? (
                        <ActivityIndicator
                          size="small"
                          color={
                            selected
                              ? theme.calendarSelectedText
                              : theme.textSecondary
                          }
                        />
                      ) : (
                        <Text
                          style={[
                            styles.replyButtonText,
                            {
                              color: selected
                                ? theme.calendarSelectedText
                                : theme.textPrimary,
                            },
                            selected && { fontWeight: '700' },
                            responding !== null && { opacity: 0.6 },
                          ]}
                        >
                          {answer === 'yes' ? 'Yes' : 'No'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
              {savedAt !== null ? (
                <SavedLine
                  key={savedAt}
                  textColor={theme.textSecondary}
                  accentColor={theme.accent}
                />
              ) : null}
            </View>
          ) : null}
          {sharedWith.length > 0 ? (
            <View style={[styles.sharedWithSection, { backgroundColor: theme.surface }]}>
              <Text style={[styles.sharedWithTitle, { color: theme.textSecondary }]}>Shared with</Text>
              {sharedWith.map((p) => (
                <View key={p.id} style={styles.sharedWithRow}>
                  <Text style={[styles.sharedWithItem, { color: theme.textPrimary }]}>
                    {p.contact_name ?? formatPhoneDisplay(p.phone_number)}
                  </Text>
                  {p.response ? (
                    <Text style={[styles.sharedWithResponse, { color: theme.textSecondary }]}>
                      {p.response === 'yes' ? 'Yes' : 'No'}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.shareButton, { backgroundColor: theme.primaryButtonBg }]} onPress={handleShare} activeOpacity={0.7} accessibilityRole="button">
              <Text style={[styles.shareButtonText, { color: theme.primaryButtonText }]}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.editButton, { backgroundColor: theme.surfaceSecondary }]}
              onPress={handleEdit}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={[styles.editButtonText, { color: theme.textPrimary }]}>Edit</Text>
            </TouchableOpacity>
            {event.from_user_id === null ? (
              // Self-created (or an account-deletion orphan): true delete —
              // red, confirmed, permanent. Self-created events never enter
              // the archive.
              <TouchableOpacity
                style={[styles.deleteButton, { backgroundColor: theme.destructiveBg }]}
                onPress={handleDelete}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.deleteButtonText, { color: theme.destructiveText }]}>Remove Event</Text>
              </TouchableOpacity>
            ) : event.archived_at === null ? (
              // Received: reversible Archive. Neutral styling (nothing
              // irreversible happens here) and no confirm dialog.
              <TouchableOpacity
                style={[styles.deleteButton, { backgroundColor: theme.surfaceSecondary }]}
                onPress={handleArchive}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.deleteButtonText, { color: theme.textPrimary }]}>Archive</Text>
              </TouchableOpacity>
            ) : (
              // An archived row still loads by id (push deep links keep
              // working); Restore puts it back on its date.
              <TouchableOpacity
                style={[styles.deleteButton, { backgroundColor: theme.surfaceSecondary }]}
                onPress={handleRestore}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.deleteButtonText, { color: theme.textPrimary }]}>Restore</Text>
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
  addToCalendarRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  addToCalendarLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  addToCalendarButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  calendarIconButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarIconPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
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
  },
  sharedWithRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sharedWithResponse: {
    fontSize: 14,
    marginLeft: 16,
  },
  replySection: {
    width: '100%',
    marginBottom: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignSelf: 'center',
  },
  replyTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  replyButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  replyButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  replyButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  replyStatus: {
    fontSize: 13,
    marginTop: 10,
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
