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
import { useSession } from '../context/SessionContext';
import { ShareSheet } from '../../components/ShareSheet';
import type { MyPerson, Circle, CircleMember } from '../../lib/types';

type ShareParams = {
  eventId: string;
  userEventId?: string;
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
      }

      load();
    }, [userId])
  );

  const handleConfirm = async () => {
    if (selectedPersonIds.size === 0) {
      Alert.alert('Select people', 'Please select at least one person to share with.');
      return;
    }

    const eventId = params.eventId;
    if (!eventId || !userId) return;

    setLoading(true);
    try {
      let userEventId = params.userEventId;

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

          if (insertErr) throw insertErr;
          userEventId = inserted!.id;
        }
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
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to share'
      );
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
