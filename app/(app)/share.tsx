import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/dialogs';
import { showError } from '../../lib/showError';
import { useSession } from '../_context/SessionContext';
import { ShareSheet } from '../../components/ShareSheet';
import type { MyPerson, Circle, CircleMember } from '../../lib/types';
import { useTheme } from '../../hooks/useTheme';

type ShareParams = {
  eventId?: string | string[];
  userEventId?: string | string[];
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
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Shares are attributed by display name ("X added you to ..."), so sending
  // one requires a saved name. null = gate the Share action; undefined = the
  // fetch hasn't resolved or failed (a fetch failure must never block sharing).
  const [displayName, setDisplayName] = useState<string | null | undefined>(undefined);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  const firstParamValue = (value?: string | string[]) =>
    Array.isArray(value) ? value[0] : value;

  const loadData = useCallback(async () => {
    if (!userId) return;

    const { data: userData, error: userErr } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', userId)
      .single();
    if (userErr) {
      // Fail open: a flaky read must not gate the Share action.
      console.error('display name load error:', userErr);
    } else {
      setDisplayName(userData?.display_name ?? null);
    }

    const { data: peopleData, error: peopleErr } = await supabase
      .from('my_people')
      .select('*')
      .eq('owner_id', userId)
      .order('contact_name');

    const { data: circlesData, error: circlesErr } = await supabase
      .from('circles')
      .select('*')
      .eq('owner_id', userId);

    let failed = !!(peopleErr || circlesErr);
    let membersData: CircleMember[] = [];
    const circleIds = (circlesData ?? []).map((c) => c.id);
    if (circleIds.length > 0) {
      const { data, error: membersErr } = await supabase
        .from('circle_members')
        .select('*')
        .in('circle_id', circleIds);
      if (membersErr) failed = true;
      membersData = data ?? [];
    }

    setPeople(peopleData ?? []);
    setCircles(circlesData ?? []);
    setCircleMembers(membersData);

    // Load existing shares so already-shared people render as completed
    // actions. Sharing is forwarding: once shared it cannot be unsent, so
    // existing shares are shown as done and only new people can be picked.
    const ueId = firstParamValue(params.userEventId);
    const sharedNow = new Set<string>();
    if (ueId) {
      const { data: shares, error: sharesErr } = await supabase
        .from('event_shares')
        .select('person_id')
        .eq('user_event_id', ueId);
      if (sharesErr) failed = true;
      for (const s of shares ?? []) sharedNow.add(s.person_id);
    }
    setAlreadySharedIds(sharedNow);
    // Preserve in-flight selections: a user who taps while the sheet is still
    // loading must not lose their picks when the fetch lands (CI caught this —
    // the reset raced the tap and left Share disabled). Only drop picks that
    // turn out to be already shared.
    setSelectedPersonIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => !sharedNow.has(id)));
      return next.size === prev.size ? prev : next;
    });

    if (failed) {
      console.error('share load error:', peopleErr ?? circlesErr);
    }
    setLoadError(failed);
  }, [userId, params.userEventId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleSaveName = async () => {
    const name = nameDraft.trim();
    if (!name || !userId || savingName) return;

    setSavingName(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ display_name: name })
        .eq('id', userId);
      if (error) throw error;
      setDisplayName(name);
    } catch (err: unknown) {
      showError('Could not save name', err);
    } finally {
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

    setLoading(true);
    try {
      let userEventId = firstParamValue(params.userEventId);

      if (!userEventId) {
        const { data: existing } = await supabase
          .from('user_events')
          .select('id')
          .eq('user_id', userId)
          .eq('event_id', eventId)
          .single();

        if (existing) {
          userEventId = existing.id;
        } else {
          const { data: inserted, error: insertErr } = await supabase
            .from('user_events')
            .insert({
              user_id: userId,
              event_id: eventId,
            })
            .select('id')
            .single();

          if (insertErr && insertErr.code !== '23505') throw insertErr;
          userEventId = inserted?.id;

          if (!userEventId) {
            const { data: afterConflict, error: fetchErr } = await supabase
              .from('user_events')
              .select('id')
              .eq('user_id', userId)
              .eq('event_id', eventId)
              .single();
            if (fetchErr) throw fetchErr;
            userEventId = afterConflict?.id;
          }
        }
      }

      if (!userEventId) {
        throw new Error('Could not find event ownership for sharing');
      }

      const toShare = Array.from(selectedPersonIds).filter(
        (pid) => !alreadySharedIds.has(pid)
      );

      if (toShare.length > 0) {
        // Delivers each recipient their own copy of the event and records the
        // shares server-side (also bumps last_shared_at).
        const { error: shareErr } = await supabase.rpc('share_event', {
          p_user_event_id: userEventId,
          p_person_ids: toShare,
        });

        if (shareErr) throw shareErr;

        // Fire-and-forget: notify the people just shared with
        supabase.functions
          .invoke('send-notification', { body: { userEventId } })
          .catch((err) => console.error('send-notification error:', err));
      }

      router.back();
    } catch (err: unknown) {
      showError('Error', err);
    } finally {
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
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6} accessibilityRole="button">
          <Text style={[styles.cancel, { color: theme.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Share with</Text>
        <TouchableOpacity
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
        onSelectionChange={setSelectedPersonIds}
      />
      {loadError ? (
        <TouchableOpacity onPress={loadData} activeOpacity={0.6} accessibilityRole="button">
          <Text style={[styles.loadError, { color: theme.textSecondary }]}>
            Could not load people. Tap to retry.
          </Text>
        </TouchableOpacity>
      ) : null}
      {!loadError && people.length > 0 && alreadySharedIds.size > 0 ? (
        <Text style={[styles.forwardingNote, { color: theme.textTertiary }]}>
          Sharing delivers people their own copy — it can't be unsent.
        </Text>
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
