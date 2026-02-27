import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { showError } from '../../lib/showError';
import { useSession } from '../_context/SessionContext';
import { PeoplePicker } from '../../components/PeoplePicker';
import { requestContactsPermission } from '../../lib/contacts';
import type { MyPerson, Circle, CircleMember } from '../../lib/types';

export default function PeopleScreen() {
  const { session } = useSession();
  const userId = session?.user?.id;
  const [people, setPeople] = useState<MyPerson[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleMembers, setCircleMembers] = useState<CircleMember[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [newCircleName, setNewCircleName] = useState('');
  const [editingCircle, setEditingCircle] = useState<Circle | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const hasRequestedContacts = useRef(false);

  const loadData = useCallback(async (): Promise<MyPerson[]> => {
    if (!userId) return [];

    const { data: peopleData } = await supabase
      .from('my_people')
      .select('*')
      .eq('owner_id', userId)
      .order('contact_name');

    const { data: circlesData } = await supabase
      .from('circles')
      .select('*')
      .eq('owner_id', userId);

    const peopleList = peopleData ?? [];
    setPeople(peopleList);
    setCircles(circlesData ?? []);

    const circleIds = (circlesData ?? []).map((c) => c.id);
    if (circleIds.length > 0) {
      const { data: membersData } = await supabase
        .from('circle_members')
        .select('*')
        .in('circle_id', circleIds);
      setCircleMembers(membersData ?? []);
    } else {
      setCircleMembers([]);
    }
    return peopleList;
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      loadData().then((peopleList) => {
        if (hasRequestedContacts.current) return;
        hasRequestedContacts.current = true;
        requestContactsPermission().then((granted) => {
          if (granted && (!peopleList || peopleList.length === 0)) {
            setShowPicker(true);
          }
        });
      });
    }, [loadData, userId])
  );

  const handleAddPeople = async () => {
    const granted = await requestContactsPermission();
    if (!granted) {
      Alert.alert(
        'Permission needed',
        'Events needs access to your contacts to add people.'
      );
      return;
    }
    setShowPicker(true);
  };

  const handleSelectContacts = async (
    selected: { phoneNumber: string; name: string | null }[]
  ) => {
    if (!userId) return;

    const count = people.length + selected.length;
    if (count > 50) {
      Alert.alert(
        'Limit reached',
        `You can add up to 50 people. You have ${people.length} and tried to add ${selected.length}.`
      );
      setShowPicker(false);
      return;
    }

    const rows = selected.map((c) => ({
      owner_id: userId,
      phone_number: c.phoneNumber,
      contact_name: c.name,
    }));
    await supabase.from('my_people').upsert(rows, {
      onConflict: 'owner_id,phone_number',
    });

    setShowPicker(false);
    loadData();
  };

  const handleAddCircle = async () => {
    if (!newCircleName.trim() || !userId) return;
    await supabase.from('circles').insert({
      owner_id: userId,
      name: newCircleName.trim(),
    });
    setNewCircleName('');
    loadData();
  };

  const handleRemoveCircle = async (circle: Circle) => {
    Alert.alert(
      'Delete circle',
      `Delete "${circle.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('circles').delete().eq('id', circle.id);
            loadData();
          },
        },
      ]
    );
  };

  const handleRemovePerson = async (person: MyPerson) => {
    Alert.alert(
      'Remove',
      `Remove ${person.contact_name ?? person.phone_number}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('my_people').delete().eq('id', person.id);
            loadData();
          },
        },
      ]
    );
  };

  const getCircleMemberIds = (circleId: string) =>
    circleMembers
      .filter((member) => member.circle_id === circleId)
      .map((member) => member.person_id);

  const handleEditCircleMembers = (circle: Circle) => {
    const memberIds = getCircleMemberIds(circle.id);
    setEditingCircle(circle);
    setSelectedMemberIds(new Set(memberIds));
  };

  const toggleMember = (personId: string) => {
    const next = new Set(selectedMemberIds);
    if (next.has(personId)) {
      next.delete(personId);
    } else {
      next.add(personId);
    }
    setSelectedMemberIds(next);
  };

  const handleSaveCircleMembers = async () => {
    if (!editingCircle) return;

    await supabase.from('circle_members').delete().eq('circle_id', editingCircle.id);

    if (selectedMemberIds.size > 0) {
      const rows = Array.from(selectedMemberIds).map((personId) => ({
        circle_id: editingCircle.id,
        person_id: personId,
      }));
      const { error } = await supabase.from('circle_members').insert(rows);
      if (error) {
        showError('Error', error);
        return;
      }
    }

    setEditingCircle(null);
    setSelectedMemberIds(new Set());
    await loadData();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My People</Text>
        <TouchableOpacity onPress={handleAddPeople} disabled={people.length >= 50}>
          <Text
            style={[
              styles.add,
              people.length >= 50 && styles.addDisabled,
            ]}
          >
            Add
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.count}>
        {people.length} / 50 people
      </Text>
      {people.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>No people yet</Text>
          <Text style={styles.emptySubtitle}>
            Add people from your contacts to organize them into circles and
            invite them to events.
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={handleAddPeople}>
            <Text style={styles.emptyButtonText}>Add from Contacts</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.circlesSection}>
            <Text style={styles.sectionTitle}>Circles</Text>
            {circles.map((circle) => (
              <View key={circle.id} style={styles.circleRow}>
                <View style={styles.circleInfo}>
                  <Text style={styles.circleName}>{circle.name}</Text>
                  <Text style={styles.circleMeta}>
                    {getCircleMemberIds(circle.id).length} members
                  </Text>
                </View>
                <View style={styles.circleActions}>
                  <TouchableOpacity onPress={() => handleEditCircleMembers(circle)}>
                    <Text style={styles.manage}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRemoveCircle(circle)}>
                    <Text style={styles.remove}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <View style={styles.addCircleRow}>
              <TextInput
                style={styles.circleInput}
                placeholder="New circle name"
                placeholderTextColor="#999"
                value={newCircleName}
                onChangeText={setNewCircleName}
              />
              <TouchableOpacity
                style={styles.addCircleBtn}
                onPress={handleAddCircle}
                disabled={!newCircleName.trim()}
              >
                <Text style={styles.addCircleBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.peopleSection}>
            <Text style={styles.sectionTitle}>People</Text>
            <FlatList
              data={people}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.personRow}>
                  <Text style={styles.personName}>
                    {item.contact_name ?? item.phone_number}
                  </Text>
                  <TouchableOpacity onPress={() => handleRemovePerson(item)}>
                    <Text style={styles.remove}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
        </>
      )}
      {showPicker && (
        <PeoplePicker
          onSelect={handleSelectContacts}
          onCancel={() => setShowPicker(false)}
          existingPhones={people.map((p) => p.phone_number)}
        />
      )}
      <Modal visible={!!editingCircle} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditingCircle(null)}>
              <Text style={styles.back}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{editingCircle?.name ?? 'Circle'}</Text>
            <TouchableOpacity onPress={handleSaveCircleMembers}>
              <Text style={styles.add}>Save</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={people}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const selected = selectedMemberIds.has(item.id);
              return (
                <TouchableOpacity
                  style={[styles.personRow, selected && styles.personRowSelected]}
                  onPress={() => toggleMember(item.id)}
                >
                  <Text style={styles.personName}>
                    {item.contact_name ?? item.phone_number}
                  </Text>
                  {selected && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
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
  back: {
    fontSize: 16,
    color: '#666',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  add: {
    fontSize: 16,
    fontWeight: '600',
  },
  addDisabled: {
    color: '#999',
  },
  count: {
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  circlesSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  peopleSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    paddingTop: 12,
  },
  circleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  circleInfo: {
    flex: 1,
  },
  circleName: {
    fontSize: 16,
  },
  circleMeta: {
    fontSize: 12,
    color: '#666',
  },
  circleActions: {
    flexDirection: 'row',
    gap: 12,
  },
  manage: {
    fontSize: 14,
    color: '#0066cc',
  },
  addCircleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  circleInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  addCircleBtn: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: '#000',
    borderRadius: 8,
  },
  addCircleBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  personRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  personName: {
    fontSize: 16,
  },
  personRowSelected: {
    backgroundColor: '#f5f5f5',
  },
  checkmark: {
    fontSize: 18,
    color: '#000',
    fontWeight: '600',
  },
  remove: {
    fontSize: 14,
    color: '#c00',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#000',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 48,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
});
