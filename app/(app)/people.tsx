import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { showConfirm } from '../../lib/dialogs';
import { showError } from '../../lib/showError';
import { formatPhoneDisplay } from '../../lib/format';
import { useSession } from '../_context/SessionContext';
import { ContactsPermissionFlow } from '../../components/ContactsPermissionFlow';
import { ManualAddPersonModal } from '../../components/ManualAddPersonModal';
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
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const [flowRestartKey, setFlowRestartKey] = useState(0);
  const [newCircleName, setNewCircleName] = useState('');
  const [editingCircle, setEditingCircle] = useState<Circle | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [hiddenPeople, setHiddenPeople] = useState<(HiddenPerson & { contact_name: string | null; phone_number: string })[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);

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

    const { data: userData, error: userErr } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', userId)
      .single();
    if (!userErr) setDisplayName(userData?.display_name ?? null);

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
      loadData().then(() => setPeopleLoaded(true));
    }, [loadData, userId])
  );

  const handleAddPeople = () => {
    // Web has no contacts API — go straight to the manual form.
    if (Platform.OS === 'web') {
      setShowManualAdd(true);
      return;
    }
    setFlowRestartKey((k) => k + 1);
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

  const handleSaveName = async () => {
    const name = nameDraft.trim();
    if (!name || !userId || nameSaving) return;

    setNameSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ display_name: name })
        .eq('id', userId);
      if (error) throw error;
      setDisplayName(name);
      setShowNameEdit(false);
    } catch (err: unknown) {
      showError('Could not save name', err);
    } finally {
      setNameSaving(false);
    }
  };

  const handleSignOut = () => {
    const phone = session?.user?.phone;
    showConfirm(
      'Sign out',
      `Sign out of ${phone ? formatPhoneDisplay(phone) : 'this account'}?`,
      {
        confirmText: 'Sign Out',
        onConfirm: async () => {
          // SessionContext reacts to the auth state change and routes back to
          // /(auth)/sign-in — no navigation code needed here.
          const { error } = await supabase.auth.signOut();
          if (error) showError('Error', error);
        },
      }
    );
  };

  const handleDeleteAccount = () => {
    showConfirm(
      'Delete account',
      'This deletes your calendar, your people, and your sign-in. Events you already shared stay on the calendars of the people you sent them to.',
      {
        confirmText: 'Delete Account',
        destructive: true,
        onConfirm: async () => {
          const { error } = await supabase.rpc('delete_my_account');
          if (error) {
            showError('Error deleting account', error);
            return;
          }
          // The server-side deletion doesn't reach the client — clear the
          // local session so SessionContext routes to sign-in.
          const { error: signOutError } = await supabase.auth.signOut();
          if (signOutError) showError('Error', signOutError);
        },
      }
    );
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
        <TouchableOpacity onPress={() => loadData()} activeOpacity={0.6} accessibilityRole="button">
          <Text style={[styles.loadError, { color: theme.destructiveLink }]}>
            Could not refresh. Tap to retry.
          </Text>
        </TouchableOpacity>
      ) : null}
      {people.length === 0 ? (
        <View style={styles.emptyState}>
          <View
            style={styles.emptyIcon}
            testID="people-empty-icon"
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            <Ionicons name="people-outline" size={52} color={theme.textTertiary} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No people yet</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            {Platform.OS === 'web'
              ? 'Add people by name and phone number to organize them into circles and invite them to events.'
              : 'Add people from your contacts to organize them into circles and invite them to events.'}
          </Text>
          <TouchableOpacity style={[styles.emptyButton, { backgroundColor: theme.primaryButtonBg }]} onPress={handleAddPeople} activeOpacity={0.7} accessibilityRole="button">
            <Text style={[styles.emptyButtonText, { color: theme.primaryButtonText }]}>
              {Platform.OS === 'web' ? 'Add Manually' : 'Add from Contacts'}
            </Text>
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
                accessibilityRole="button"
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
      <View style={[styles.footer, { borderTopColor: theme.borderLight }]}>
        <TouchableOpacity
          onPress={() => {
            setNameDraft(displayName ?? '');
            setShowNameEdit(true);
          }}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={`Your name: ${displayName ?? 'not set'}`}
          style={styles.footerButton}
        >
          <Text style={[styles.footerAction, { color: theme.textSecondary }]}>
            Your name: {displayName ?? 'Not set'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSignOut}
          activeOpacity={0.6}
          accessibilityRole="button"
          style={styles.footerButton}
        >
          <Text style={[styles.footerAction, { color: theme.textTertiary }]}>Sign out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDeleteAccount}
          activeOpacity={0.6}
          accessibilityRole="button"
          style={styles.footerButton}
        >
          <Text style={[styles.footerAction, { color: theme.destructiveLink }]}>Delete account</Text>
        </TouchableOpacity>
      </View>
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
      {userId && Platform.OS === 'web' ? (
        <ManualAddPersonModal
          visible={showManualAdd}
          userId={userId}
          peopleCount={people.length}
          onClose={() => setShowManualAdd(false)}
          onSaved={() => {
            setShowManualAdd(false);
            loadData();
          }}
        />
      ) : null}
      <Modal visible={showNameEdit} animationType="slide" presentationStyle="pageSheet">
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: theme.background, paddingTop: insets.top + 12 },
          ]}
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.borderLight }]}>
            <TouchableOpacity
              onPress={() => setShowNameEdit(false)}
              activeOpacity={0.6}
              accessibilityRole="button"
            >
              <Text style={[styles.back, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Your name</Text>
            <TouchableOpacity
              onPress={handleSaveName}
              disabled={nameSaving || !nameDraft.trim()}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityState={{ disabled: nameSaving || !nameDraft.trim() }}
            >
              <Text
                style={[
                  styles.add,
                  { color: theme.textPrimary },
                  (nameSaving || !nameDraft.trim()) && { color: theme.textTertiary },
                ]}
              >
                Save
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.manualForm}>
            <Text style={[styles.manualLabel, { color: theme.textSecondary }]}>Name</Text>
            <TextInput
              style={[styles.manualInput, { borderColor: theme.border, color: theme.textPrimary }]}
              placeholder="Your name"
              placeholderTextColor={theme.textTertiary}
              value={nameDraft}
              onChangeText={(text) => setNameDraft(text.replace(/[\r\n]/g, ''))}
              maxLength={50}
              autoCapitalize="words"
              autoFocus
              accessibilityLabel="Your name"
            />
            <Text style={[styles.manualHint, { color: theme.textTertiary }]}>
              Friends see this name when you share an event with them.
            </Text>
          </View>
        </View>
      </Modal>
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
  footer: {
    borderTopWidth: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  footerButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  footerAction: {
    fontSize: 14,
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
  manualForm: {
    padding: 20,
  },
  manualLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  manualInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  manualHint: {
    fontSize: 13,
    marginTop: 8,
  },
});
