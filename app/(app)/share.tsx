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

type ShareParams = {
  eventId?: string | string[];
  userEventId?: string | string[];
};

export default function ShareScreen() {
  const params = useLocalSearchParams<ShareParams>();
  const { session } = useSession();
  const userId = session?.user?.id;
  const [people, setPeople] = useState<MyPerson[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleMembers, setCircleMembers] = useState<CircleMember[]>([]);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(false);

  const firstParamValue = (value?: string | string[]) =>
    Array.isArray(value) ? value[0] : value;

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;

      async function load() {
        const { data: peopleData } = await supabase
          .from('my_people')
          .select('*')
          .eq('owner_id', userId)
          .order('contact_name');

        const { data: circlesData } = await supabase
          .from('circles')
          .select('*')
          .eq('owner_id', userId);

        setPeople(peopleData ?? []);
        setCircles(circlesData ?? []);

        const circleIds = (circlesData ?? []).map((c) => c.id);
        let membersData: CircleMember[] = [];
        if (circleIds.length > 0) {
          const { data } = await supabase
            .from('circle_members')
            .select('*')
            .in('circle_id', circleIds);
          membersData = data ?? [];
        }
        setCircleMembers(membersData);

        // Load existing shares so already-shared people appear selected
        const ueId = firstParamValue(params.userEventId);
        if (ueId) {
          const { data: shares } = await supabase
            .from('event_shares')
            .select('person_id')
            .eq('user_event_id', ueId);
          const ids = (shares ?? []).map((s) => s.person_id);
          setSelectedPersonIds(new Set(ids));
        } else {
          setSelectedPersonIds(new Set());
        }
      }

      load();
    }, [userId, params.userEventId])
  );

  const handleConfirm = async () => {
    if (selectedPersonIds.size === 0) {
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

      const shares = Array.from(selectedPersonIds).map((person_id) => ({
        user_event_id: userEventId,
        person_id,
      }));

      const { error: shareErr } = await supabase
        .from('event_shares')
        .upsert(shares, {
          onConflict: 'user_event_id,person_id',
          ignoreDuplicates: true,
        });

      if (shareErr) throw shareErr;

      await supabase
        .from('my_people')
        .update({ last_shared_at: new Date().toISOString() })
        .in('id', Array.from(selectedPersonIds));

      router.back();
    } catch (err: unknown) {
      showError('Error', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Share with</Text>
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={loading || selectedPersonIds.size === 0}
        >
          <Text
            style={[
              styles.done,
              (loading || selectedPersonIds.size === 0) && styles.doneDisabled,
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
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
  done: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  doneDisabled: {
    color: '#999',
  },
});
