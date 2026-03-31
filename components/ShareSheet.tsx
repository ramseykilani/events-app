import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { router } from 'expo-router';
import type { MyPerson, Circle } from '../lib/types';
import { useTheme } from '../hooks/useTheme';

type Props = {
  people: MyPerson[];
  circles: Circle[];
  circleMembers: { circle_id: string; person_id: string }[];
  selectedPersonIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
};

export function ShareSheet({
  people,
  circles,
  circleMembers,
  selectedPersonIds,
  onSelectionChange,
}: Props) {
  const theme = useTheme();

  const getCirclePersonIds = (circleId: string): string[] =>
    circleMembers
      .filter((m) => m.circle_id === circleId)
      .map((m) => m.person_id);

  const togglePerson = (id: string) => {
    const next = new Set(selectedPersonIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  };

  const toggleCircle = (circle: Circle) => {
    const personIds = getCirclePersonIds(circle.id);
    const allSelected = personIds.every((id) => selectedPersonIds.has(id));
    const next = new Set(selectedPersonIds);
    if (allSelected) {
      personIds.forEach((id) => next.delete(id));
    } else {
      personIds.forEach((id) => next.add(id));
    }
    onSelectionChange(next);
  };

  return (
    <View style={styles.container}>
      {circles.length > 0 && (
        <View style={[styles.circlesSection, { borderBottomColor: theme.borderLight }]}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Circles</Text>
          <View style={styles.circleChips}>
            {circles.map((circle) => (
              <TouchableOpacity
                key={circle.id}
                style={[styles.chip, { backgroundColor: theme.surfaceSecondary }]}
                onPress={() => toggleCircle(circle)}
              >
                <Text style={[styles.chipText, { color: theme.textPrimary }]}>{circle.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      <View style={styles.peopleSection}>
        <View style={styles.peopleHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>People</Text>
          {people.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/(app)/people')}>
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
            >
              <Text style={[styles.emptyPeopleButtonText, { color: theme.primaryButtonText }]}>Add People</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={people}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const selected = selectedPersonIds.has(item.id);
              return (
                <TouchableOpacity
                  style={[
                    styles.personRow,
                    { borderBottomColor: theme.surfaceSecondary },
                    selected && { backgroundColor: theme.selectedBg },
                  ]}
                  onPress={() => togglePerson(item.id)}
                >
                  <Text style={[styles.personName, { color: theme.textPrimary }]}>
                    {item.contact_name ?? item.phone_number}
                  </Text>
                  {selected && <Text style={[styles.checkmark, { color: theme.textPrimary }]}>✓</Text>}
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
});
