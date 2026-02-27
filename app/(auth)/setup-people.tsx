import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { showError } from '../../lib/showError';
import { useSession } from '../_context/SessionContext';
import { PeoplePicker } from '../../components/PeoplePicker';
import { requestContactsPermission } from '../../lib/contacts';
import type { MyPerson } from '../../lib/types';

export default function SetupPeopleScreen() {
  const { session } = useSession();
  const userId = session?.user?.id;
  const [people, setPeople] = useState<MyPerson[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const loadPeople = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('my_people')
      .select('*')
      .eq('owner_id', userId)
      .order('contact_name');
    setPeople(data ?? []);
  };

  useEffect(() => {
    loadPeople();
  }, [userId]);

  const handleAddPeople = async () => {
    const granted = await requestContactsPermission();
    if (!granted) {
      Alert.alert(
        'Permission needed',
        'Events needs access to your contacts to set up your people list.'
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

    const { error } = await supabase.from('my_people').upsert(rows, {
      onConflict: 'owner_id,phone_number',
    });

    if (error) {
      showError('Error', error);
    }

    setShowPicker(false);
    await loadPeople();
  };

  const handleRemovePerson = async (person: MyPerson) => {
    Alert.alert('Remove', `Remove ${person.contact_name ?? person.phone_number}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('my_people').delete().eq('id', person.id);
          await loadPeople();
        },
      },
    ]);
  };

  const handleContinue = async () => {
    if (people.length === 0) {
      Alert.alert('Add people', 'Select at least one person to continue.');
      return;
    }
    router.replace('/(app)');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Set Up Your People</Text>
        <Text style={styles.subtitle}>
          Add contacts you want to share events with. You can add up to 50.
        </Text>
      </View>

      <View style={styles.topRow}>
        <Text style={styles.count}>{people.length} / 50 people</Text>
        <TouchableOpacity
          style={[styles.addButton, people.length >= 50 && styles.disabledButton]}
          onPress={handleAddPeople}
          disabled={people.length >= 50}
        >
          <Text style={styles.addButtonText}>Add from Contacts</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={people}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
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
        ListEmptyComponent={
          <Text style={styles.emptyState}>No people added yet.</Text>
        }
      />

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            people.length === 0 && styles.disabledButton,
          ]}
          onPress={handleContinue}
          disabled={people.length === 0}
        >
          <Text style={styles.continueText}>Continue</Text>
        </TouchableOpacity>
      </View>

      {showPicker && (
        <PeoplePicker
          onSelect={handleSelectContacts}
          onCancel={() => setShowPicker(false)}
          existingPhones={people.map((p) => p.phone_number)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 56,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
  },
  topRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  count: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  addButton: {
    backgroundColor: '#000',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
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
  remove: {
    color: '#c00',
    fontSize: 14,
  },
  emptyState: {
    color: '#666',
    fontSize: 15,
    paddingVertical: 24,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  continueButton: {
    backgroundColor: '#000',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
});
