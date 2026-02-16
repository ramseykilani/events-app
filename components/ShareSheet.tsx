import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { router } from 'expo-router';
import type { MyPerson, Circle } from '../lib/types';

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
        <View style={styles.circlesSection}>
          <Text style={styles.sectionTitle}>Circles</Text>
          <View style={styles.circleChips}>
            {circles.map((circle) => (
              <TouchableOpacity
                key={circle.id}
                style={styles.chip}
                onPress={() => toggleCircle(circle)}
              >
                <Text style={styles.chipText}>{circle.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      <View style={styles.peopleSection}>
        <View style={styles.peopleHeader}>
          <Text style={styles.sectionTitle}>People</Text>
          <TouchableOpacity onPress={() => router.push('/(app)/people')}>
            <Text style={styles.manageLink}>Manage</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={people}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const selected = selectedPersonIds.has(item.id);
            return (
              <TouchableOpacity
                style={[styles.personRow, selected && styles.personRowSelected]}
                onPress={() => togglePerson(item.id)}
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
    borderBottomColor: '#eee',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  circleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#f0f0f0',
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
    color: '#0066cc',
  },
  personRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  personRowSelected: {
    backgroundColor: '#f5f5f5',
  },
  personName: {
    fontSize: 16,
  },
  checkmark: {
    fontSize: 18,
    color: '#000',
    fontWeight: '600',
  },
});
