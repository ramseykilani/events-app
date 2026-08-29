import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { router } from 'expo-router';
import type { MyPerson, Circle, Send } from '../lib/types';
import { formatPhoneDisplay } from '../lib/format';
import { shareDeliveryStatus } from '../lib/deliveryStatus';
import { useTheme } from '../hooks/useTheme';

type Props = {
  people: MyPerson[];
  circles: Circle[];
  circleMembers: { circle_id: string; person_id: string }[];
  selectedPersonIds: Set<string>;
  // People the event was already shared with. A share is a completed action
  // (it delivered them their own copy), so these rows render as done and are
  // not interactive.
  sharedPersonIds?: Set<string>;
  // Per-person delivery status for shared rows (Share Delivery Status),
  // keyed by person_id. Absent entry = legacy "✓ Shared".
  sharedStatuses?: Map<string, Pick<Send, 'sms_status' | 'sms_error_code'>>;
  onSelectionChange: (ids: Set<string>) => void;
  onAddPeople?: () => void;
};

export function ShareSheet({
  people,
  circles,
  circleMembers,
  selectedPersonIds,
  sharedPersonIds,
  sharedStatuses,
  onSelectionChange,
  onAddPeople,
}: Props) {
  const theme = useTheme();
  const shared = sharedPersonIds ?? new Set<string>();

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
                    {allShared ? `✓ ${circle.name}` : circle.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
      <View style={styles.peopleSection}>
        <View style={styles.peopleHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>People</Text>
          {people.length > 0 && (
            <TouchableOpacity
              onPress={() => router.push('/(app)/people')}
              activeOpacity={0.6}
              accessibilityRole="button"
              hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
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
              onPress={() => (onAddPeople ? onAddPeople() : router.push('/(app)/people'))}
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
              const status = isShared
                ? shareDeliveryStatus(item, sharedStatuses?.get(item.id))
                : null;
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
                >
                  <View style={styles.personText}>
                    <Text
                      style={[
                        styles.personName,
                        { color: isShared ? theme.textTertiary : theme.textPrimary },
                      ]}
                    >
                      {item.contact_name ?? formatPhoneDisplay(item.phone_number)}
                    </Text>
                    {status?.subLabel ? (
                      <Text style={[styles.sharedSubLabel, { color: theme.destructiveText }]}>
                        {status.subLabel}
                      </Text>
                    ) : null}
                  </View>
                  {isShared && status ? (
                    <Text
                      style={[
                        styles.sharedLabel,
                        {
                          color:
                            status.tone === 'destructive'
                              ? theme.destructiveText
                              : theme.textTertiary,
                        },
                      ]}
                    >
                      {status.label}
                    </Text>
                  ) : (
                    // Circle = selectable, ✓ = confirmed/done (shared design
                    // vocabulary): selection is a circle outline that fills
                    // with the accent, never a checkmark.
                    <View
                      testID={selected ? 'selection-circle-selected' : 'selection-circle'}
                      style={[
                        styles.selectionCircle,
                        { borderColor: selected ? theme.accent : theme.border },
                        selected && { backgroundColor: theme.accent },
                      ]}
                    />
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
    borderRadius: 22,
    // 44pt touch target — the pills grow slightly taller; no pixel baseline
    // covers the share sheet.
    minHeight: 44,
    justifyContent: 'center',
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
    gap: 12,
  },
  personText: {
    flex: 1,
    flexShrink: 1,
  },
  personName: {
    fontSize: 16,
  },
  selectionCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  sharedLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  sharedSubLabel: {
    fontSize: 13,
    marginTop: 2,
  },
});
