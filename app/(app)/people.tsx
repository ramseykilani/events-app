import { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  Platform,
  ScrollView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { showAlert, showConfirm } from '../../lib/dialogs';
import { formatPhoneDisplay } from '../../lib/format';
import { useSession } from '../_context/SessionContext';
import { ContactsPermissionFlow } from '../../components/ContactsPermissionFlow';
import { ManualAddPersonModal } from '../../components/ManualAddPersonModal';
import { ThemedSwitch } from '../../components/ThemedSwitch';
import type { MyPerson, Circle, CircleMember, HiddenPerson } from '../../lib/types';
import { useTheme } from '../../hooks/useTheme';
import { isAbortError, withRetries, withWriteTimeout } from '../../lib/timeoutSignal';

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
  const [notifyPush, setNotifyPush] = useState(true);
  const [notifySms, setNotifySms] = useState(true);
  const [prefSaving, setPrefSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  // State alone admits same-tick double taps; the ref guards synchronously.
  const busyRef = useRef(false);

  const runMutation = useCallback(async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const showMutationError = useCallback((title: string, err: unknown) => {
    console.error(`${title}:`, err);
    showAlert(
      title,
      isAbortError(err)
        ? 'That took too long. Check your connection and try again.'
        : 'Something went wrong. Try again.'
    );
  }, []);

  const loadData = useCallback(async (): Promise<MyPerson[]> => {
    if (!userId) return [];

    try {
      const staged = await withRetries(async (signal) => {
        const [peopleRes, circlesRes, hiddenRes, userRes] = await Promise.all([
          supabase
            .from('my_people')
            .select('*')
            .eq('owner_id', userId)
            .order('contact_name')
            .abortSignal(signal),
          supabase.from('circles').select('*').eq('owner_id', userId).abortSignal(signal),
          supabase
            .from('hidden_people')
            .select('id, owner_id, person_id, hidden_at, my_people(contact_name, phone_number)')
            .eq('owner_id', userId)
            .abortSignal(signal),
          supabase
            .from('users')
            .select('display_name, notify_push, notify_sms')
            .eq('id', userId)
            .abortSignal(signal)
            .single(),
        ]);
        if (peopleRes.error) throw peopleRes.error;
        if (circlesRes.error) throw circlesRes.error;
        if (hiddenRes.error) throw hiddenRes.error;

        let membersData: CircleMember[] = [];
        const circleIds = (circlesRes.data ?? []).map((c) => c.id);
        if (circleIds.length > 0) {
          const { data, error: membersErr } = await supabase
            .from('circle_members')
            .select('*')
            .in('circle_id', circleIds)
            .abortSignal(signal);
          if (membersErr) throw membersErr;
          membersData = data ?? [];
        }

        return {
          people: (peopleRes.data ?? []) as MyPerson[],
          circles: (circlesRes.data ?? []) as Circle[],
          hidden: (hiddenRes.data ?? []).map((row: Record<string, unknown>) => {
            const person = row.my_people as Record<string, unknown> | null;
            return {
              id: row.id as string,
              owner_id: row.owner_id as string,
              person_id: row.person_id as string,
              hidden_at: row.hidden_at as string,
              contact_name: (person?.contact_name as string | null) ?? null,
              phone_number: (person?.phone_number as string) ?? '',
            };
          }),
          members: membersData,
          // The name/prefs read only feeds the footer — its failure must not
          // fail the load. undefined = read failed, keep the previous value.
          displayName: userRes.error
            ? undefined
            : (userRes.data?.display_name ?? null),
          notifyPush: userRes.error ? undefined : (userRes.data?.notify_push ?? true),
          notifySms: userRes.error ? undefined : (userRes.data?.notify_sms ?? true),
        };
      });

      // Commit only a fully successful load — a failed refresh keeps the
      // last-good lists instead of blanking the screen.
      setPeople(staged.people);
      setCircles(staged.circles);
      setHiddenPeople(staged.hidden);
      setCircleMembers(staged.members);
      if (staged.displayName !== undefined) setDisplayName(staged.displayName);
      if (staged.notifyPush !== undefined) setNotifyPush(staged.notifyPush);
      if (staged.notifySms !== undefined) setNotifySms(staged.notifySms);
      setLoadError(false);
      return staged.people;
    } catch (err) {
      console.error('people load error:', err);
      setLoadError(true);
      return [];
    }
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
    await runMutation(async () => {
      try {
        await withWriteTimeout(async (signal) => {
          const { error } = await supabase
            .from('circles')
            .insert({
              owner_id: userId,
              name: newCircleName.trim(),
            })
            .abortSignal(signal);
          if (error) throw error;
        });
        setNewCircleName('');
        loadData();
      } catch (err) {
        showMutationError('Could not create circle', err);
      }
    });
  };

  const handleRemoveCircle = async (circle: Circle) => {
    showConfirm(
      'Delete circle',
      `Delete "${circle.name}"?`,
      {
        confirmText: 'Delete',
        destructive: true,
        onConfirm: async () => {
          await runMutation(async () => {
            try {
              await withWriteTimeout(async (signal) => {
                const { error } = await supabase
                  .from('circles')
                  .delete()
                  .eq('id', circle.id)
                  .abortSignal(signal);
                if (error) throw error;
              });
              loadData();
            } catch (err) {
              showMutationError('Could not delete circle', err);
            }
          });
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
          await runMutation(async () => {
            try {
              await withWriteTimeout(async (signal) => {
                const { error } = await supabase
                  .from('my_people')
                  .delete()
                  .eq('id', person.id)
                  .abortSignal(signal);
                if (error) throw error;
              });
              loadData();
            } catch (err) {
              showMutationError('Could not remove person', err);
            }
          });
        },
      }
    );
  };

  const handleUnhide = async (hiddenId: string) => {
    await runMutation(async () => {
      try {
        await withWriteTimeout(async (signal) => {
          const { error } = await supabase
            .from('hidden_people')
            .delete()
            .eq('id', hiddenId)
            .abortSignal(signal);
          if (error) throw error;
        });
        loadData();
      } catch (err) {
        showMutationError('Could not unhide person', err);
      }
    });
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
    const circle = editingCircle;

    await runMutation(async () => {
      try {
        await withWriteTimeout(async (signal) => {
          const { error: delError } = await supabase
            .from('circle_members')
            .delete()
            .eq('circle_id', circle.id)
            .abortSignal(signal);
          if (delError) throw delError;

          if (selectedMemberIds.size > 0) {
            const rows = Array.from(selectedMemberIds).map((personId) => ({
              circle_id: circle.id,
              person_id: personId,
            }));
            const { error } = await supabase
              .from('circle_members')
              .insert(rows)
              .abortSignal(signal);
            if (error) {
              // The delete-then-insert sequence isn't atomic: restore the
              // previous members so the circle isn't left empty by a failed
              // save.
              if (previousIds.length > 0) {
                await supabase
                  .from('circle_members')
                  .insert(
                    previousIds.map((personId) => ({
                      circle_id: circle.id,
                      person_id: personId,
                    }))
                  )
                  .abortSignal(signal);
              }
              throw error;
            }
          }
        });
        setEditingCircle(null);
        setSelectedMemberIds(new Set());
        await loadData();
      } catch (err) {
        showMutationError('Could not save circle', err);
        await loadData();
      }
    });
  };

  // The name editor is its own pageSheet; iOS won't present one sheet while
  // another is mid-dismiss, so it opens just after Settings starts closing
  // (next tick on web, where the modals don't animate).
  const openNameEditor = () => {
    setNameDraft(displayName ?? '');
    setShowSettings(false);
    setTimeout(() => setShowNameEdit(true), Platform.OS === 'web' ? 0 : 300);
  };

  const handleSaveName = async () => {
    const name = nameDraft.trim();
    if (!name || !userId || nameSaving) return;

    await runMutation(async () => {
      setNameSaving(true);
      try {
        await withWriteTimeout(async (signal) => {
          const { error } = await supabase
            .from('users')
            .update({ display_name: name })
            .eq('id', userId)
            .abortSignal(signal);
          if (error) throw error;
        });
        setDisplayName(name);
        setShowNameEdit(false);
      } catch (err: unknown) {
        showMutationError('Could not save name', err);
      } finally {
        setNameSaving(false);
      }
    });
  };

  // Notification prefs are set-to-value writes of the caller's own row, so a
  // retry is safe; the switch is disabled mid-flight instead of runMutation's
  // drop-if-busy, which would strand the optimistic flip.
  const handleTogglePref = async (key: 'notify_push' | 'notify_sms', value: boolean) => {
    if (!userId || prefSaving) return;
    const setState = key === 'notify_push' ? setNotifyPush : setNotifySms;
    setState(value);
    setPrefSaving(true);
    try {
      await withWriteTimeout(async (signal) => {
        const { error } = await supabase
          .from('users')
          .update({ [key]: value })
          .eq('id', userId)
          .abortSignal(signal);
        if (error) throw error;
      });
    } catch (err) {
      setState(!value);
      showMutationError('Could not update notification setting', err);
    } finally {
      setPrefSaving(false);
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
          // /(auth)/sign-in — no navigation code needed here. auth.signOut is
          // not abortSignal-aware, so it stays unwrapped.
          const { error } = await supabase.auth.signOut();
          if (error) showAlert('Could not sign out', 'Something went wrong. Try again.');
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
          await runMutation(async () => {
            try {
              await withWriteTimeout(async (signal) => {
                const { error } = await supabase
                  .rpc('delete_my_account')
                  .abortSignal(signal);
                if (error) throw error;
              });
            } catch (err) {
              showMutationError('Could not delete account', err);
              return;
            }
            // The server-side deletion doesn't reach the client — clear the
            // local session so SessionContext routes to sign-in. auth.signOut
            // is not abortSignal-aware, so it stays unwrapped.
            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) {
              showAlert('Could not sign out', 'Your account was deleted, but signing out failed. Try again.');
            }
          });
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
        <TouchableOpacity style={styles.textAction} onPress={() => router.back()} activeOpacity={0.6} accessibilityRole="button">
          <Text style={[styles.back, { color: theme.textSecondary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textPrimary }]}>My People</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => setShowSettings(true)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.textAction}
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
      </View>
      <Text style={[styles.count, { color: theme.textSecondary }]}>
        {people.length} / 50 people
      </Text>
      {loadError ? (
        <TouchableOpacity style={styles.textAction} onPress={() => loadData()} activeOpacity={0.6} accessibilityRole="button">
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
            {/* Capped + scrollable so a long circle list can't starve the
                people list below — the screen's chrome is otherwise all
                pinned, and enough circles used to collapse it to zero. */}
            <ScrollView style={styles.circleList}>
              {circles.map((circle) => (
                <View key={circle.id} style={styles.circleRow}>
                  <View style={styles.circleInfo}>
                    <Text style={[styles.circleName, { color: theme.textPrimary }]}>{circle.name}</Text>
                    <Text style={[styles.circleMeta, { color: theme.textSecondary }]}>
                      {getCircleMemberIds(circle.id).length} members
                    </Text>
                  </View>
                  <View style={styles.circleActions}>
                    <TouchableOpacity style={styles.textAction} onPress={() => handleEditCircleMembers(circle)} activeOpacity={0.6} accessibilityRole="button">
                      <Text style={[styles.manage, { color: theme.linkText }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.textAction} onPress={() => handleRemoveCircle(circle)} activeOpacity={0.6} accessibilityRole="button">
                      <Text style={[styles.remove, { color: theme.destructiveLink }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
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
                disabled={!newCircleName.trim() || busy}
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
                  <TouchableOpacity style={styles.textAction} onPress={() => handleRemovePerson(item)} activeOpacity={0.6} accessibilityRole="button">
                    <Text style={[styles.remove, { color: theme.destructiveLink }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
        </>
      )}
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
      <Modal visible={showSettings} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSettings(false)}>
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: theme.background, paddingTop: insets.top + 12 },
          ]}
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.borderLight }]}>
            <TouchableOpacity
              style={styles.textAction}
              onPress={() => setShowSettings(false)}
              activeOpacity={0.6}
              accessibilityRole="button"
            >
              <Text style={[styles.back, { color: theme.textSecondary }]}>Close</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Settings</Text>
            <View style={styles.textAction} />
          </View>
          <ScrollView
            style={styles.settingsScroll}
            contentContainerStyle={{ paddingBottom: 20 + insets.bottom }}
          >
            <TouchableOpacity
              style={[styles.settingsRow, { borderBottomColor: theme.borderLight }]}
              onPress={openNameEditor}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`Your name: ${displayName ?? 'not set'}`}
            >
              <Text style={[styles.prefLabel, { color: theme.textPrimary }]}>
                Your name: {displayName ?? 'Not set'}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Notifications</Text>
            <View style={styles.prefRow}>
              <Text style={[styles.prefLabel, { color: theme.textPrimary }]}>Push notifications</Text>
              <ThemedSwitch
                value={notifyPush}
                onValueChange={(value) => handleTogglePref('notify_push', value)}
                disabled={prefSaving}
                accessibilityLabel="Push notifications"
              />
            </View>
            <View style={styles.prefRow}>
              <Text style={[styles.prefLabel, { color: theme.textPrimary }]}>Text messages (SMS)</Text>
              <ThemedSwitch
                value={notifySms}
                onValueChange={(value) => handleTogglePref('notify_sms', value)}
                disabled={prefSaving}
                accessibilityLabel="Text messages (SMS)"
              />
            </View>
            <Text style={[styles.manualHint, { color: theme.textTertiary }]}>
              Events still land on your calendar either way.
            </Text>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              Hidden{hiddenPeople.length > 0 ? ` (${hiddenPeople.length})` : ''}
            </Text>
            {hiddenPeople.length === 0 ? (
              <Text style={[styles.manualHint, { color: theme.textTertiary }]}>
                No hidden people
              </Text>
            ) : (
              hiddenPeople.map((item) => (
                <View key={item.id} style={[styles.personRow, { borderBottomColor: theme.surfaceSecondary }]}>
                  <Text style={[styles.personName, { color: theme.textPrimary }]}>
                    {item.contact_name ?? formatPhoneDisplay(item.phone_number)}
                  </Text>
                  <TouchableOpacity style={styles.textAction} onPress={() => handleUnhide(item.id)} activeOpacity={0.6} accessibilityRole="button">
                    <Text style={[styles.unhide, { color: theme.linkText }]}>Unhide</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <View style={[styles.settingsAccount, { borderTopColor: theme.borderLight }]}>
              <TouchableOpacity
                onPress={handleSignOut}
                activeOpacity={0.6}
                accessibilityRole="button"
                style={styles.settingsRow}
              >
                <Text style={[styles.prefLabel, { color: theme.textTertiary }]}>Sign out</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteAccount}
                activeOpacity={0.6}
                accessibilityRole="button"
                style={styles.settingsRow}
              >
                <Text style={[styles.prefLabel, { color: theme.destructiveLink }]}>Delete account</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={showNameEdit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNameEdit(false)}>
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: theme.background, paddingTop: insets.top + 12 },
          ]}
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.borderLight }]}>
            <TouchableOpacity
              style={styles.textAction}
              onPress={() => setShowNameEdit(false)}
              activeOpacity={0.6}
              accessibilityRole="button"
            >
              <Text style={[styles.back, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Your name</Text>
            <TouchableOpacity
              style={styles.textAction}
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
      <Modal visible={!!editingCircle} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingCircle(null)}>
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: theme.background, paddingTop: insets.top + 12 },
          ]}
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.borderLight }]}>
            <TouchableOpacity style={styles.textAction} onPress={() => setEditingCircle(null)} activeOpacity={0.6} accessibilityRole="button">
              <Text style={[styles.back, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.textPrimary }]}>{editingCircle?.name ?? 'Circle'}</Text>
            <TouchableOpacity
              style={styles.textAction}
              onPress={handleSaveCircleMembers}
              disabled={busy}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
            >
              <Text
                style={[
                  styles.add,
                  { color: theme.textPrimary },
                  busy && { color: theme.textTertiary },
                ]}
              >
                Save
              </Text>
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
  circleList: {
    // ~3 circle rows; the section scrolls internally past that.
    maxHeight: 150,
  },
  peopleSection: {
    flex: 1,
    // Never let the pinned chrome shrink the list to nothing — a collapsed
    // viewport spills rows under the footer (they stay visible and eat taps).
    minHeight: 140,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsScroll: {
    paddingHorizontal: 20,
  },
  settingsRow: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  settingsAccount: {
    marginTop: 12,
    paddingTop: 4,
    borderTopWidth: 1,
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
    minHeight: 44,
  },
  prefLabel: {
    fontSize: 16,
  },
  // 44pt minimum touch target for bare-text buttons (header actions, row
  // Remove/Edit/Delete/Unhide). Rows are already ≥44 tall, so this grows the
  // tap area without shifting row layout.
  textAction: {
    minHeight: 44,
    justifyContent: 'center',
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
