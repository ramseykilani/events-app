import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  Linking,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { showAlert, showConfirm } from '../../lib/dialogs';
import { showError } from '../../lib/showError';
import { formatPhoneDisplay } from '../../lib/format';
import { useSession } from '../_context/SessionContext';
import { PeoplePicker } from '../../components/PeoplePicker';
import { requestContactsPermission, getContactsPermissionDetails, getContactsPermissionStatus } from '../../lib/contacts';
import type { MyPerson, Circle, CircleMember, HiddenPerson } from '../../lib/types';
import { useTheme } from '../../hooks/useTheme';

export default function PeopleScreen() {
  const { session } = useSession();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const userId = session?.user?.id;
  const [people, setPeople] = useState<MyPerson[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleMembers, setCircleMembers] = useState<CircleMember[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [newCircleName, setNewCircleName] = useState('');
  const [editingCircle, setEditingCircle] = useState<Circle | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [hiddenPeople, setHiddenPeople] = useState<(HiddenPerson & { contact_name: string | null; phone_number: string })[]>([]);
  const [loadError, setLoadError] = useState(false);
  const hasRequestedContacts = useRef(false);

  const loadData = useCallback(async (): Promise<MyPerson[]> => {
    if (!userId) return [];

    const { data: peopleData, error: peopleErr } = await supabase
      .from('my_people')
      .select('*')
      .eq('owner_id', userId)
      .order('contact_name');

    const { data: circlesData, error: circlesErr } = await supabase
      .from('circles')
      .select('*')
      .eq('owner_id', userId);

    const { data: hiddenData, error: hiddenErr } = await supabase
      .from('hidden_people')
      .select('id, owner_id, person_id, hidden_at, my_people(contact_name, phone_number)')
      .eq('owner_id', userId);

    let failed = !!(peopleErr || circlesErr || hiddenErr);
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

    if (failed) {
      console.error('people load error:', peopleErr ?? circlesErr ?? hiddenErr);
      setLoadError(true);
    } else {
      setLoadError(false);
    }

    const peopleList = peopleData ?? [];
    setPeople(peopleList);
    setCircles(circlesData ?? []);
    setHiddenPeople(
      (hiddenData ?? []).map((row: Record<string, unknown>) => {
        const person = row.my_people as Record<string, unknown> | null;
        return {
          id: row.id as string,
          owner_id: row.owner_id as string,
          person_id: row.person_id as string,
          hidden_at: row.hidden_at as string,
          contact_name: (person?.contact_name as string | null) ?? null,
          phone_number: (person?.phone_number as string) ?? '',
        };
      })
    );
    setCircleMembers(membersData);
    return peopleList;
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      loadData().then((peopleList) => {
        if (hasRequestedContacts.current) return;
        hasRequestedContacts.current = true;
        // Only auto-open picker if permission is already granted — never silently
        // trigger the OS dialog here; the user can tap Add to go through that flow.
        getContactsPermissionStatus().then((granted) => {
          if (granted && (!peopleList || peopleList.length === 0)) {
            setShowPicker(true);
          }
        });
      });
    }, [loadData, userId])
  );

  const handleAddPeople = async () => {
    const status = await getContactsPermissionDetails();

    if (status === 'granted') {
      setShowPicker(true);
      return;
    }

    if (status === 'denied' || status === 'restricted') {
      showConfirm(
        'Contacts Access Disabled',
        'Events uses your contacts so you can quickly add people to share events with. Please enable contacts access in Settings.',
        {
          confirmText: 'Open Settings',
          cancelText: 'Not Now',
          onConfirm: () => Linking.openSettings(),
        }
      );
      return;
    }

    // undetermined — explain why before triggering the OS dialog
    showConfirm(
      'Access Your Contacts?',
      'Events uses your contacts so you can easily add people to share events with. Your contacts are never uploaded or stored on our servers.',
      {
        confirmText: 'Continue',
        cancelText: 'Not Now',
        onConfirm: async () => {
          const granted = await requestContactsPermission();
          if (granted) {
            setShowPicker(true);
          } else {
            showConfirm(
              'Contacts Access Disabled',
              'To add people from your contacts, please enable contacts access in Settings.',
              {
                confirmText: 'Open Settings',
                cancelText: 'Not Now',
                onConfirm: () => Linking.openSettings(),
              }
            );
          }
        },
      }
    );
  };

  const handleSelectContacts = async (
    selected: { phoneNumber: string; name: string | null }[]
  ) => {
    if (!userId) return;

    const count = people.length + selected.length;
    if (count > 50) {
      showAlert(
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
      // Keep the picker open so the selection isn't lost
      showError('Error adding people', error);
      return;
    }

    setShowPicker(false);
    loadData();
  };

  const handleAddCircle = async () => {
    if (!newCircleName.trim() || !userId) return;
    const { error } = await supabase.from('circles').insert({
      owner_id: userId,
      name: newCircleName.trim(),
    });
    if (error) {
      showError('Error creating circle', error);
      return;
    }
    setNewCircleName('');
    loadData();
  };

  const handleRemoveCircle = async (circle: Circle) => {
    showConfirm(
      'Delete circle',
      `Delete "${circle.name}"?`,
      {
        confirmText: 'Delete',
        destructive: true,
        onConfirm: async () => {
          const { error } = await supabase.from('circles').delete().eq('id', circle.id);
          if (error) {
            showError('Error deleting circle', error);
            return;
          }
          loadData();
        },
      }
    );
  };

  const handleRemovePerson = async (person: MyPerson) => {
    showConfirm(
      'Remove',
      `Remove ${person.contact_name ?? person.phone_number}?`,
      {
        confirmText: 'Remove',
        destructive: true,
        onConfirm: async () => {
          const { error } = await supabase.from('my_people').delete().eq('id', person.id);
          if (error) {
            showError('Error removing person', error);
            return;
          }
          loadData();
        },
      }
    );
  };

  const handleUnhide = async (hiddenId: string) => {
    const { error } = await supabase.from('hidden_people').delete().eq('id', hiddenId);
    if (error) {
      showError('Error', error);
      return;
    }
    loadData();
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

    const previousIds = getCircleMemberIds(editingCircle.id);

    const { error: delError } = await supabase
      .from('circle_members')
      .delete()
      .eq('circle_id', editingCircle.id);
    if (delError) {
      showError('Error', delError);
      return;
    }

    if (selectedMemberIds.size > 0) {
      const rows = Array.from(selectedMemberIds).map((personId) => ({
        circle_id: editingCircle.id,
        person_id: personId,
      }));
      const { error } = await supabase.from('circle_members').insert(rows);
      if (error) {
        // The delete-then-insert sequence isn't atomic: restore the previous
        // members so the circle isn't left empty by a failed save.
        if (previousIds.length > 0) {
          await supabase.from('circle_members').insert(
            previousIds.map((personId) => ({
              circle_id: editingCircle.id,
              person_id: personId,
            }))
          );
        }
        showError('Error', error);
        await loadData();
        return;
      }
    }

    setEditingCircle(null);
    setSelectedMemberIds(new Set());
    await loadData();
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
          <Text style={[styles.back, { color: theme.textSecondary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textPrimary }]}>My People</Text>
        <TouchableOpacity
          onPress={handleAddPeople}
          disabled={people.length >= 50}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityState={{ disabled: people.length >= 50 }}
        >
          <Text
            style={[
              styles.add,
              { color: theme.textPrimary },
              people.length >= 50 && { color: theme.textTertiary },
            ]}
          >
            Add
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.count, { color: theme.textSecondary }]}>
        {people.length} / 50 people
      </Text>
      {loadError ? (
        <TouchableOpacity onPress={() => loadData()} activeOpacity={0.6}>
          <Text style={[styles.loadError, { color: theme.destructiveLink }]}>
            Could not refresh. Tap to retry.
          </Text>
        </TouchableOpacity>
      ) : null}
      {people.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No people yet</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Add people from your contacts to organize them into circles and
            invite them to events.
          </Text>
          <TouchableOpacity style={[styles.emptyButton, { backgroundColor: theme.primaryButtonBg }]} onPress={handleAddPeople} activeOpacity={0.7} accessibilityRole="button">
            <Text style={[styles.emptyButtonText, { color: theme.primaryButtonText }]}>Add from Contacts</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={[styles.circlesSection, { borderBottomColor: theme.borderLight }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Circles</Text>
            {circles.map((circle) => (
              <View key={circle.id} style={styles.circleRow}>
                <View style={styles.circleInfo}>
                  <Text style={[styles.circleName, { color: theme.textPrimary }]}>{circle.name}</Text>
                  <Text style={[styles.circleMeta, { color: theme.textSecondary }]}>
                    {getCircleMemberIds(circle.id).length} members
                  </Text>
                </View>
                <View style={styles.circleActions}>
                  <TouchableOpacity onPress={() => handleEditCircleMembers(circle)} activeOpacity={0.6} accessibilityRole="button">
                    <Text style={[styles.manage, { color: theme.linkText }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRemoveCircle(circle)} activeOpacity={0.6} accessibilityRole="button">
                    <Text style={[styles.remove, { color: theme.destructiveLink }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <View style={styles.addCircleRow}>
              <TextInput
                style={[styles.circleInput, { borderColor: theme.border, color: theme.textPrimary }]}
                placeholder="New circle name"
                placeholderTextColor={theme.textTertiary}
                value={newCircleName}
                onChangeText={setNewCircleName}
              />
              <TouchableOpacity
                style={[styles.addCircleBtn, { backgroundColor: theme.primaryButtonBg }]}
                onPress={handleAddCircle}
                disabled={!newCircleName.trim()}
                activeOpacity={0.7}
              >
                <Text style={[styles.addCircleBtnText, { color: theme.primaryButtonText }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.peopleSection}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>People</Text>
            <FlatList
              data={people}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={[styles.personRow, { borderBottomColor: theme.surfaceSecondary }]}>
                  <Text style={[styles.personName, { color: theme.textPrimary }]}>
                    {item.contact_name ?? formatPhoneDisplay(item.phone_number)}
                  </Text>
                  <TouchableOpacity onPress={() => handleRemovePerson(item)} activeOpacity={0.6} accessibilityRole="button">
                    <Text style={[styles.remove, { color: theme.destructiveLink }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListFooterComponent={
                hiddenPeople.length > 0 ? (
                  <View style={[styles.hiddenSection, { borderTopColor: theme.borderLight }]}>
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Hidden</Text>
                    {hiddenPeople.map((item) => (
                      <View key={item.id} style={[styles.personRow, { borderBottomColor: theme.surfaceSecondary }]}>
                        <Text style={[styles.personName, { color: theme.textPrimary }]}>
                          {item.contact_name ?? formatPhoneDisplay(item.phone_number)}
                        </Text>
                        <TouchableOpacity onPress={() => handleUnhide(item.id)} activeOpacity={0.6} accessibilityRole="button">
                          <Text style={[styles.unhide, { color: theme.linkText }]}>Unhide</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : null
              }
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
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: theme.background, paddingTop: insets.top + 12 },
          ]}
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.borderLight }]}>
            <TouchableOpacity onPress={() => setEditingCircle(null)} activeOpacity={0.6} accessibilityRole="button">
              <Text style={[styles.back, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.textPrimary }]}>{editingCircle?.name ?? 'Circle'}</Text>
            <TouchableOpacity onPress={handleSaveCircleMembers} activeOpacity={0.6} accessibilityRole="button">
              <Text style={[styles.add, { color: theme.textPrimary }]}>Save</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={people}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const selected = selectedMemberIds.has(item.id);
              return (
                <TouchableOpacity
                  style={[
                    styles.personRow,
                    { borderBottomColor: theme.surfaceSecondary },
                    selected && { backgroundColor: theme.selectedBg },
                  ]}
                  onPress={() => toggleMember(item.id)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.personName, { color: theme.textPrimary }]}>
                    {item.contact_name ?? formatPhoneDisplay(item.phone_number)}
                  </Text>
                  {selected && <Text style={[styles.checkmark, { color: theme.textPrimary }]}>✓</Text>}
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  back: {
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  add: {
    fontSize: 16,
    fontWeight: '600',
  },
  count: {
    fontSize: 14,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  loadError: {
    fontSize: 14,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  circlesSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  peopleSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
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
  },
  circleActions: {
    flexDirection: 'row',
    gap: 12,
  },
  manage: {
    fontSize: 14,
  },
  addCircleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  circleInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  addCircleBtn: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 8,
  },
  addCircleBtnText: {
    fontWeight: '600',
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
  checkmark: {
    fontSize: 18,
    fontWeight: '600',
  },
  remove: {
    fontSize: 14,
  },
  hiddenSection: {
    marginTop: 8,
    paddingTop: 4,
    borderTopWidth: 1,
  },
  unhide: {
    fontSize: 14,
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
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
});
