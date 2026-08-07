import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
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
  const userId = session?.user?.id;
  const [people, setPeople] = useState<MyPerson[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleMembers, setCircleMembers] = useState<CircleMember[]>([]);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(
    new Set()
  );
  const [initialSharedIds, setInitialSharedIds] = useState<Set<string>>(
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

    // Load existing shares so already-shared people appear selected
    const ueId = firstParamValue(params.userEventId);
    if (ueId) {
      const { data: shares, error: sharesErr } = await supabase
        .from('event_shares')
        .select('person_id')
        .eq('user_event_id', ueId);
      if (sharesErr) failed = true;
      const ids = new Set((shares ?? []).map((s) => s.person_id));
      setSelectedPersonIds(ids);
      setInitialSharedIds(ids);
    } else {
      setSelectedPersonIds(new Set());
      setInitialSharedIds(new Set());
    }

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
    // after creating it). When editing existing shares, deselecting everyone
    // is allowed and removes all shares.
    if (selectedPersonIds.size === 0 && initialSharedIds.size === 0) {
      Alert.alert('Select people', 'Please select at least one person to share with.');
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

      const toAdd = Array.from(selectedPersonIds).filter(
        (pid) => !initialSharedIds.has(pid)
      );
      const toRemove = Array.from(initialSharedIds).filter(
        (pid) => !selectedPersonIds.has(pid)
      );

      if (toAdd.length > 0) {
        const { error: shareErr } = await supabase
          .from('event_shares')
          .upsert(
            toAdd.map((person_id) => ({
              user_event_id: userEventId,
              person_id,
            })),
            {
              onConflict: 'user_event_id,person_id',
              ignoreDuplicates: true,
            }
          );

        if (shareErr) throw shareErr;
      }

      if (toRemove.length > 0) {
        const { error: removeErr } = await supabase
          .from('event_shares')
          .delete()
          .eq('user_event_id', userEventId)
          .in('person_id', toRemove);

        if (removeErr) throw removeErr;
      }

      if (selectedPersonIds.size > 0) {
        await supabase
          .from('my_people')
          .update({ last_shared_at: new Date().toISOString() })
          .in('id', Array.from(selectedPersonIds));
      }

      // Fire-and-forget: notify only newly added recipients
      if (toAdd.length > 0) {
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancel, { color: theme.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Share with</Text>
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={loading || (selectedPersonIds.size === 0 && initialSharedIds.size === 0)}
        >
          <Text
            style={[
              styles.done,
              { color: theme.textPrimary },
              (loading || (selectedPersonIds.size === 0 && initialSharedIds.size === 0)) && { color: theme.textTertiary },
            ]}
          >
            Done
          </Text>
        </TouchableOpacity>
      </View>
      <ShareSheet
        people={people}
        circles={circles}
        circleMembers={circleMembers}
        selectedPersonIds={selectedPersonIds}
        onSelectionChange={setSelectedPersonIds}
      />
      {loadError ? (
        <TouchableOpacity onPress={loadData}>
          <Text style={[styles.loadError, { color: theme.textSecondary }]}>
            Could not load people. Tap to retry.
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 48,
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
});
