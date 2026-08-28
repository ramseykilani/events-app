import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/dialogs';
import { useSession } from '../_context/SessionContext';
import { ShareSheet } from '../../components/ShareSheet';
import { ContactsPermissionFlow } from '../../components/ContactsPermissionFlow';
import type { MyPerson, Circle, CircleMember, Send } from '../../lib/types';
import { useTheme } from '../../hooks/useTheme';
import { isAbortError, withFetchTimeout, withRetries, withWriteTimeout } from '../../lib/timeoutSignal';

type ShareParams = {
  eventId?: string | string[];
};

export default function ShareScreen() {
  const params = useLocalSearchParams<ShareParams>();
  const { session } = useSession();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const userId = session?.user?.id;
  const [people, setPeople] = useState<MyPerson[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleMembers, setCircleMembers] = useState<CircleMember[]>([]);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(
    new Set()
  );
  const [alreadySharedIds, setAlreadySharedIds] = useState<Set<string>>(
    new Set()
  );
  // Per-person delivery status for already-shared rows (Share Delivery
  // Status), keyed by person_id. Absent entry = legacy "✓ Shared".
  const [sharedStatuses, setSharedStatuses] = useState<
    Map<string, Pick<Send, 'sms_status' | 'sms_error_code'>>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Shares are attributed by display name (the "X wants to go to ... with
  // you" SMS/push attribution), so sending one requires a saved name.
  // null = gate the Share action; undefined = the fetch hasn't resolved or
  // failed (a fetch failure must never block sharing).
  const [displayName, setDisplayName] = useState<string | null | undefined>(undefined);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [flowRestartKey, setFlowRestartKey] = useState(0);
  const shareInFlightRef = useRef(false);
  const nameSaveInFlightRef = useRef(false);

  const firstParamValue = (value?: string | string[]) =>
    Array.isArray(value) ? value[0] : value;

  const loadData = useCallback(async () => {
    if (!userId) return;

    // Fail open: a flaky name read must never gate the Share action.
    void withFetchTimeout(async (signal) => {
      const { data, error } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', userId)
        .abortSignal(signal)
        .single();
      if (error) throw error;
      return data;
    })
      .then((data) => setDisplayName(data?.display_name ?? null))
      .catch((err) => console.error('display name load error:', err));

    try {
      const staged = await withRetries(async (signal) => {
        const [peopleRes, circlesRes] = await Promise.all([
          supabase
            .from('my_people')
            .select('*')
            .eq('owner_id', userId)
            .order('contact_name')
            .abortSignal(signal),
          supabase.from('circles').select('*').eq('owner_id', userId).abortSignal(signal),
        ]);
        if (peopleRes.error) throw peopleRes.error;
        if (circlesRes.error) throw circlesRes.error;

        let membersData: CircleMember[] = [];
        const circleIds = (circlesRes.data ?? []).map((c) => c.id);
        if (circleIds.length > 0) {
          const { data, error: membersErr } = await supabase
            .from('circle_members')
            .select('*')
            .in('circle_id', circleIds)
            .abortSignal(signal);
          if (membersErr) throw membersErr;
          membersData = data ?? [];
        }

        // Load existing sends so already-shared people render as completed
        // actions. Sharing is forwarding: once shared it cannot be unsent, so
        // existing sends are shown as done and only new people can be picked.
        // The SMS delivery columns drive the per-person status label.
        const eventId = firstParamValue(params.eventId);
        const sharedNow = new Set<string>();
        const statuses = new Map<string, Pick<Send, 'sms_status' | 'sms_error_code'>>();
        if (eventId) {
          const { data: sends, error: sendsErr } = await supabase
            .from('sends')
            .select('person_id, sms_status, sms_error_code')
            .eq('event_id', eventId)
            .abortSignal(signal);
          if (sendsErr) throw sendsErr;
          for (const s of sends ?? []) {
            sharedNow.add(s.person_id);
            statuses.set(s.person_id, {
              sms_status: s.sms_status,
              sms_error_code: s.sms_error_code,
            });
          }
        }

        return {
          people: (peopleRes.data ?? []) as MyPerson[],
          circles: (circlesRes.data ?? []) as Circle[],
          members: membersData,
          sharedNow,
          statuses,
        };
      });

      // Commit only a fully successful load — a failed refresh keeps the
      // last-good lists instead of blanking the sheet.
      setPeople(staged.people);
      setCircles(staged.circles);
      setCircleMembers(staged.members);
      setAlreadySharedIds(staged.sharedNow);
      setSharedStatuses(staged.statuses);
      // Preserve in-flight selections: a user who taps while the sheet is
      // still loading must not lose their picks when the fetch lands (CI
      // caught this — the reset raced the tap and left Share disabled). Only
      // drop picks that turn out to be already shared.
      setSelectedPersonIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set([...prev].filter((id) => !staged.sharedNow.has(id)));
        return next.size === prev.size ? prev : next;
      });
      setLoadError(false);
    } catch (err) {
      console.error('share load error:', err);
      setLoadError(true);
    } finally {
      setPeopleLoaded(true);
    }
  }, [userId, params.eventId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleSaveName = async () => {
    const name = nameDraft.trim();
    if (!name || !userId || savingName) return;
    if (nameSaveInFlightRef.current) return;
    nameSaveInFlightRef.current = true;

    setSavingName(true);
    try {
      await withWriteTimeout(async (signal) => {
        const { error } = await supabase
          .from('users')
          .update({ display_name: name })
          .eq('id', userId)
          .abortSignal(signal);
        if (error) throw error;
      });
      setDisplayName(name);
    } catch (err: unknown) {
      console.error('Failed to save name:', err);
      showAlert(
        'Could not save name',
        isAbortError(err)
          ? 'That took too long. Check your connection and try again.'
          : 'Something went wrong. Try again.'
      );
    } finally {
      nameSaveInFlightRef.current = false;
      setSavingName(false);
    }
  };

  const handleConfirm = async () => {
    // Sharing is mandatory when the event has never been shared (e.g. right
    // after creating it). Afterwards the action is additive-only: existing
    // shares are completed and cannot be unsent.
    if (selectedPersonIds.size === 0) {
      showAlert('Select people', 'Please select at least one person to share with.');
      return;
    }
    if (displayName === null) {
      showAlert('Add your name', 'Save your name below so friends know who shared this.');
      return;
    }

    const eventId = firstParamValue(params.eventId);
    if (!eventId || !userId) return;
    if (shareInFlightRef.current) return;
    shareInFlightRef.current = true;

    setLoading(true);
    try {
      let shared = false;
      // Captured inside the write so the notification below names exactly
      // the new recipients — notifying every sends row re-pings people who
      // were already on the event (KI-003).
      let notifiedPersonIds: string[] = [];

      await withWriteTimeout(async (signal) => {
        const toShare = Array.from(selectedPersonIds).filter(
          (pid) => !alreadySharedIds.has(pid)
        );

        if (toShare.length > 0) {
          // Delivers each recipient their own copy of the caller's row and
          // records the sends server-side (also bumps last_shared_at).
          const { error: shareErr } = await supabase
            .rpc('share_event', {
              p_event_id: eventId,
              p_person_ids: toShare,
            })
            .abortSignal(signal);

          if (shareErr) throw shareErr;
          shared = true;
          notifiedPersonIds = toShare;
        }
      });

      // Fire-and-forget, outside the write budget: notify the people just
      // shared with — and only them.
      if (shared) {
        supabase.functions
          .invoke('send-notification', {
            body: { eventId, personIds: notifiedPersonIds },
          })
          .catch((err) => console.error('send-notification error:', err));
      }

      router.back();
    } catch (err: unknown) {
      console.error('Failed to share:', err);
      showAlert(
        'Could not share',
        isAbortError(err)
          ? 'That took too long. Check your connection and try again.'
          : 'Something went wrong. Try again.'
      );
    } finally {
      shareInFlightRef.current = false;
      setLoading(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.background, paddingTop: insets.top + 12 },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity style={styles.headerAction} onPress={() => router.back()} activeOpacity={0.6} accessibilityRole="button">
          <Text style={[styles.cancel, { color: theme.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Share with</Text>
        <TouchableOpacity
          style={styles.headerAction}
          onPress={handleConfirm}
          disabled={loading || selectedPersonIds.size === 0 || displayName === null}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading || selectedPersonIds.size === 0 || displayName === null }}
        >
          <Text
            style={[
              styles.done,
              { color: theme.textPrimary },
              (loading || selectedPersonIds.size === 0 || displayName === null) && { color: theme.textTertiary },
            ]}
          >
            Share
          </Text>
        </TouchableOpacity>
      </View>
      {displayName === null && (
        <View style={[styles.nameGate, { borderBottomColor: theme.borderLight }]}>
          <Text style={[styles.nameGateText, { color: theme.textSecondary }]}>
            Your friends get a text when you share — this is the name they'll see.
          </Text>
          <View style={styles.nameGateRow}>
            <TextInput
              style={[styles.nameInput, { borderColor: theme.border, color: theme.textPrimary }]}
              placeholder="Your name"
              placeholderTextColor={theme.textTertiary}
              value={nameDraft}
              onChangeText={(text) => setNameDraft(text.replace(/[\r\n]/g, ''))}
              maxLength={50}
              autoCapitalize="words"
              editable={!savingName}
              accessibilityLabel="Your name"
            />
            <TouchableOpacity
              style={[styles.nameSaveButton, { backgroundColor: theme.primaryButtonBg }]}
              onPress={handleSaveName}
              disabled={!nameDraft.trim() || savingName}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ disabled: !nameDraft.trim() || savingName }}
            >
              <Text style={[styles.nameSaveText, { color: theme.primaryButtonText }]}>
                {savingName ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <ShareSheet
        people={people}
        circles={circles}
        circleMembers={circleMembers}
        selectedPersonIds={selectedPersonIds}
        sharedPersonIds={alreadySharedIds}
        sharedStatuses={sharedStatuses}
        onSelectionChange={setSelectedPersonIds}
        onAddPeople={
          Platform.OS === 'web' ? undefined : () => setFlowRestartKey((k) => k + 1)
        }
      />
      {loadError ? (
        <TouchableOpacity style={styles.headerAction} onPress={loadData} activeOpacity={0.6} accessibilityRole="button">
          <Text style={[styles.loadError, { color: theme.textSecondary }]}>
            Could not load people. Tap to retry.
          </Text>
        </TouchableOpacity>
      ) : null}
      {!loadError && people.length > 0 ? (
        <Text style={[styles.forwardingNote, { color: theme.textTertiary }]}>
          Sharing is like sending a text — once you send it, you can't take it
          back.
        </Text>
      ) : null}
      {userId && Platform.OS !== 'web' ? (
        <ContactsPermissionFlow
          userId={userId}
          existingPhones={people.map((p) => p.phone_number)}
          peopleCount={people.length}
          autoStart={peopleLoaded && people.length === 0}
          restartKey={flowRestartKey}
          onPeopleChanged={loadData}
        />
      ) : null}
    </View>
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
  // 44pt minimum touch target for the bare-text header actions (and the
  // load-error retry). No pixel baseline covers this screen.
  headerAction: {
    minHeight: 44,
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  done: {
    fontSize: 16,
    fontWeight: '600',
  },
  loadError: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  nameGate: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 10,
  },
  nameGateText: {
    fontSize: 14,
    lineHeight: 20,
  },
  nameGateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 44,
  },
  nameSaveButton: {
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
    minHeight: 44,
  },
  nameSaveText: {
    fontSize: 15,
    fontWeight: '600',
  },
  forwardingNote: {
    fontSize: 13,
    textAlign: 'center',
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
});
