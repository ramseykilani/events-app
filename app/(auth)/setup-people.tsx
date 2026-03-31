import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { showError } from '../../lib/showError';
import { useSession } from '../_context/SessionContext';
import { PeoplePicker } from '../../components/PeoplePicker';
import { requestContactsPermission, getContactsPermissionDetails } from '../../lib/contacts';
import type { MyPerson } from '../../lib/types';
import { useTheme } from '../../hooks/useTheme';

export default function SetupPeopleScreen() {
  const { session } = useSession();
  const userId = session?.user?.id;
  const [people, setPeople] = useState<MyPerson[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const theme = useTheme();

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
    const status = await getContactsPermissionDetails();

    if (status === 'granted') {
      setShowPicker(true);
      return;
    }

    if (status === 'denied' || status === 'restricted') {
      Alert.alert(
        'Contacts Access Disabled',
        'Events uses your contacts so you can quickly add people to share events with. Please enable contacts access in Settings.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    // undetermined — explain why before triggering the OS dialog
    Alert.alert(
      'Access Your Contacts?',
      'Events uses your contacts so you can easily add people to share events with. Your contacts are never uploaded or stored on our servers.',
      [
        { text: 'Not Now', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            const granted = await requestContactsPermission();
            if (granted) {
              setShowPicker(true);
            } else {
              Alert.alert(
                'Contacts Access Disabled',
                'To add people from your contacts, please enable contacts access in Settings.',
                [
                  { text: 'Not Now', style: 'cancel' },
                  { text: 'Open Settings', onPress: () => Linking.openSettings() },
                ]
              );
            }
          },
        },
      ]
    );
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Set Up Your People</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Add contacts you want to share events with. You can add up to 50.
        </Text>
      </View>

      <View style={[styles.topRow, { borderBottomColor: theme.borderLight }]}>
        <Text style={[styles.count, { color: theme.textSecondary }]}>{people.length} / 50 people</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primaryButtonBg }, people.length >= 50 && styles.disabledButton]}
          onPress={handleAddPeople}
          disabled={people.length >= 50}
        >
          <Text style={[styles.addButtonText, { color: theme.primaryButtonText }]}>Add from Contacts</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={people}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={[styles.personRow, { borderBottomColor: theme.surfaceSecondary }]}>
            <Text style={[styles.personName, { color: theme.textPrimary }]}>
              {item.contact_name ?? item.phone_number}
            </Text>
            <TouchableOpacity onPress={() => handleRemovePerson(item)}>
              <Text style={[styles.remove, { color: theme.destructiveLink }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.emptyState, { color: theme.textSecondary }]}>No people added yet.</Text>
        }
      />

      <View style={[styles.footer, { borderTopColor: theme.borderLight }]}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            { backgroundColor: theme.primaryButtonBg },
            people.length === 0 && styles.disabledButton,
          ]}
          onPress={handleContinue}
          disabled={people.length === 0}
        >
          <Text style={[styles.continueText, { color: theme.primaryButtonText }]}>Continue</Text>
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
  },
  topRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  count: {
    fontSize: 14,
    marginBottom: 10,
  },
  addButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonText: {
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
  },
  personName: {
    fontSize: 16,
  },
  remove: {
    fontSize: 14,
  },
  emptyState: {
    fontSize: 15,
    paddingVertical: 24,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  continueButton: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueText: {
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
});
