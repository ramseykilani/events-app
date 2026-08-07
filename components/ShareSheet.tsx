import { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { router } from 'expo-router';
import type { MyPerson, Circle } from '../lib/types';
import { formatPhoneDisplay } from '../lib/format';
import { useTheme } from '../hooks/useTheme';
// #region agent log
import {
  dbgLog,
  scheduleDomProbes,
  probeScreenTexts,
  probeOnceLater,
} from '../lib/debugInstrumentation';
// #endregion

type Props = {
  people: MyPerson[];
  circles: Circle[];
  circleMembers: { circle_id: string; person_id: string }[];
  selectedPersonIds: Set<string>;
  // People the event was already shared with. A share is a completed action
  // (it delivered them their own copy), so these rows render as done and are
  // not interactive.
  sharedPersonIds?: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
};

export function ShareSheet({
  people,
  circles,
  circleMembers,
  selectedPersonIds,
  sharedPersonIds,
  onSelectionChange,
}: Props) {
  const theme = useTheme();
  const shared = sharedPersonIds ?? new Set<string>();

  // #region agent log
  dbgLog(
    'ShareSheet.tsx:render',
    'ShareSheet render',
    {
      peopleCount: people.length,
      circlesCount: circles.length,
      selectedCount: selectedPersonIds.size,
      sharedCount: shared.size,
      theme: {
        background: theme.background,
        textPrimary: theme.textPrimary,
        textTertiary: theme.textTertiary,
      },
      people: people.map((p) => ({
        id: p.id,
        contact_name: p.contact_name,
        phone_number: p.phone_number,
      })),
    },
    'C'
  );
  useEffect(() => {
    if (people.length === 0) return;
    const targets = people.map(
      (p) => p.contact_name ?? formatPhoneDisplay(p.phone_number)
    );
    dbgLog(
      'ShareSheet.tsx:effect',
      'people loaded, scheduling DOM probes',
      { targets },
      'A'
    );
    scheduleDomProbes((phase) =>
      probeScreenTexts({
        screen: 'share',
        phase,
        targets,
        controls: ['Share with', 'People', 'Manage', 'Cancel'],
        hypothesisId: 'A',
      })
    );
  }, [people]);
  // #endregion

  const getCirclePersonIds = (circleId: string): string[] =>
    circleMembers
      .filter((m) => m.circle_id === circleId)
      .map((m) => m.person_id);

  const togglePerson = (id: string) => {
    if (shared.has(id)) return;
    const next = new Set(selectedPersonIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
    // #region agent log
    const tapped = people.find((p) => p.id === id);
    dbgLog(
      'ShareSheet.tsx:togglePerson',
      'person row tapped',
      { id, nowSelected: next.has(id), display: tapped?.contact_name ?? null },
      'A'
    );
    // Re-probe after the selection commit: if the name text becomes painted
    // only after interaction, that points at a browser paint stall (A).
    if (tapped) {
      const display =
        tapped.contact_name ?? formatPhoneDisplay(tapped.phone_number);
      probeOnceLater(400, (phase) =>
        probeScreenTexts({
          screen: 'share',
          phase: `after-toggle-${phase}`,
          targets: [display, '✓'],
          controls: ['People'],
          hypothesisId: 'A',
        })
      );
    }
    // #endregion
  };

  const toggleCircle = (circle: Circle) => {
    const selectableIds = getCirclePersonIds(circle.id).filter(
      (id) => !shared.has(id)
    );
    if (selectableIds.length === 0) return;
    const allSelected = selectableIds.every((id) => selectedPersonIds.has(id));
    const next = new Set(selectedPersonIds);
    if (allSelected) {
      selectableIds.forEach((id) => next.delete(id));
    } else {
      selectableIds.forEach((id) => next.add(id));
    }
    onSelectionChange(next);
  };

  return (
    <View style={styles.container}>
      {circles.length > 0 && (
        <View style={[styles.circlesSection, { borderBottomColor: theme.borderLight }]}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Circles</Text>
          <View style={styles.circleChips}>
            {circles.map((circle) => {
              const personIds = getCirclePersonIds(circle.id);
              const selectableIds = personIds.filter((id) => !shared.has(id));
              const allShared =
                personIds.length > 0 && selectableIds.length === 0;
              const allSelected =
                selectableIds.length > 0 &&
                selectableIds.every((id) => selectedPersonIds.has(id));
              return (
                <TouchableOpacity
                  key={circle.id}
                  disabled={allShared}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: allSelected
                        ? theme.selectedBg
                        : theme.surfaceSecondary,
                    },
                    allShared && { opacity: 0.5 },
                  ]}
                  onPress={() => toggleCircle(circle)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: allSelected, disabled: allShared }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: allShared ? theme.textTertiary : theme.textPrimary },
                    ]}
                  >
                    {allSelected || allShared ? `✓ ${circle.name}` : circle.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
      <View style={styles.peopleSection}>
        <View style={styles.peopleHeader}>
          <Text
            style={[styles.sectionTitle, { color: theme.textSecondary }]}
            // #region agent log
            testID="dbg-share-people-title"
            // #endregion
          >
            People
          </Text>
          {people.length > 0 && (
            <TouchableOpacity
              onPress={() => router.push('/(app)/people')}
              activeOpacity={0.6}
              accessibilityRole="button"
            >
              <Text style={[styles.manageLink, { color: theme.linkText }]}>Manage</Text>
            </TouchableOpacity>
          )}
        </View>
        {people.length === 0 ? (
          <View style={styles.emptyPeople}>
            <Text style={[styles.emptyPeopleText, { color: theme.textSecondary }]}>
              No people added yet. Add contacts to your people list so you can
              invite them to events.
            </Text>
            <TouchableOpacity
              style={[styles.emptyPeopleButton, { backgroundColor: theme.primaryButtonBg }]}
              onPress={() => router.push('/(app)/people')}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={[styles.emptyPeopleButtonText, { color: theme.primaryButtonText }]}>Add People</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={people}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isShared = shared.has(item.id);
              const selected = selectedPersonIds.has(item.id);
              // #region agent log
              const dbgDisplay =
                item.contact_name ?? formatPhoneDisplay(item.phone_number);
              dbgLog(
                'ShareSheet.tsx:renderItem',
                'person row render',
                { id: item.id, display: dbgDisplay, isShared, selected },
                'C'
              );
              // #endregion
              return (
                <TouchableOpacity
                  disabled={isShared}
                  style={[
                    styles.personRow,
                    { borderBottomColor: theme.surfaceSecondary },
                    selected && { backgroundColor: theme.selectedBg },
                  ]}
                  onPress={() => togglePerson(item.id)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: isShared }}
                  // #region agent log
                  testID="dbg-share-person-row"
                  // #endregion
                >
                  <Text
                    style={[
                      styles.personName,
                      { color: isShared ? theme.textTertiary : theme.textPrimary },
                    ]}
                    // #region agent log
                    testID="dbg-share-person-name"
                    // #endregion
                  >
                    {item.contact_name ?? formatPhoneDisplay(item.phone_number)}
                  </Text>
                  {isShared ? (
                    <Text
                      style={[styles.sharedLabel, { color: theme.textTertiary }]}
                      // #region agent log
                      testID="dbg-share-shared-label"
                      // #endregion
                    >
                      ✓ Shared
                    </Text>
                  ) : (
                    selected && <Text style={[styles.checkmark, { color: theme.textPrimary }]}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  circlesSection: {
    padding: 20,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  circleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 14,
  },
  peopleSection: {
    flex: 1,
    padding: 20,
  },
  peopleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  manageLink: {
    fontSize: 14,
  },
  emptyPeople: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyPeopleText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  emptyPeopleButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyPeopleButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  personRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  personName: {
    fontSize: 16,
  },
  checkmark: {
    fontSize: 18,
    fontWeight: '600',
  },
  sharedLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
