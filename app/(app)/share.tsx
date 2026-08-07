import { useState, useCallback } from 'react';
import {
  View,
  Text,
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

  const firstParamValue = (value?: string | string[]) =>
    Array.isArray(value) ? value[0] : value;

  const loadData = useCallback(async () => {
    if (!userId) return;

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
    if (ueId) {
      const { data: shares, error: sharesErr } = await supabase
        .from('event_shares')
        .select('person_id')
        .eq('user_event_id', ueId);
      if (sharesErr) failed = true;
      setAlreadySharedIds(new Set((shares ?? []).map((s) => s.person_id)));
    } else {
      setAlreadySharedIds(new Set());
    }
    setSelectedPersonIds(new Set());

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

  const handleConfirm = async () => {
    // Sharing is mandatory when the event has never been shared (e.g. right
    // after creating it). Afterwards the action is additive-only: existing
    // shares are completed and cannot be unsent.
    if (selectedPersonIds.size === 0) {
      showAlert('Select people', 'Please select at least one person to share with.');
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
          disabled={loading || selectedPersonIds.size === 0}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading || selectedPersonIds.size === 0 }}
        >
          <Text
            style={[
              styles.done,
              { color: theme.textPrimary },
              (loading || selectedPersonIds.size === 0) && { color: theme.textTertiary },
            ]}
          >
            Share
          </Text>
        </TouchableOpacity>
      </View>
      <ShareSheet
        people={people}
        circles={circles}
        circleMembers={circleMembers}
        selectedPersonIds={selectedPersonIds}
        sharedPersonIds={alreadySharedIds}
        onSelectionChange={setSelectedPersonIds}
      />
      {loadError ? (
        <TouchableOpacity onPress={loadData} activeOpacity={0.6}>
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
  forwardingNote: {
    fontSize: 13,
    textAlign: 'center',
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
});
