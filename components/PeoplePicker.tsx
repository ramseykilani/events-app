import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
} from 'react-native';
import { getContactsWithPhones } from '../lib/contacts';
import type { ContactWithPhone } from '../lib/contacts';

type Props = {
  onSelect: (contacts: { phoneNumber: string; name: string | null }[]) => void;
  onCancel: () => void;
  existingPhones: string[];
};

export function PeoplePicker({
  onSelect,
  onCancel,
  existingPhones,
}: Props) {
  const [contacts, setContacts] = useState<ContactWithPhone[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const existingSet = new Set(existingPhones);

  useEffect(() => {
    getContactsWithPhones().then((data) => {
      setContacts(data.filter((c) => !existingSet.has(c.normalized)));
      setLoading(false);
    });
  }, []);

  const toggle = (c: ContactWithPhone) => {
    const next = new Set(selected);
    if (next.has(c.normalized)) {
      next.delete(c.normalized);
    } else {
      next.add(c.normalized);
    }
    setSelected(next);
  };

  const handleConfirm = () => {
    const chosen = contacts.filter((c) => selected.has(c.normalized));
    onSelect(
      chosen.map((c) => ({
        phoneNumber: c.normalized,
        name: c.name,
      }))
    );
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add people</Text>
          <TouchableOpacity onPress={handleConfirm}>
            <Text
              style={[
                styles.done,
                selected.size === 0 && styles.doneDisabled,
              ]}
            >
              Add {selected.size > 0 ? `(${selected.size})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <Text style={styles.loading}>Loading contacts...</Text>
        ) : (
          <FlatList
            data={contacts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isSelected = selected.has(item.normalized);
              return (
                <TouchableOpacity
                  style={[styles.row, isSelected && styles.rowSelected]}
                  onPress={() => toggle(item)}
                >
                  <Text style={styles.name}>
                    {item.name ?? item.phoneNumber}
                  </Text>
                  {isSelected && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
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
  cancel: {
    fontSize: 16,
    color: '#666',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  done: {
    fontSize: 16,
    fontWeight: '600',
  },
  doneDisabled: {
    color: '#999',
  },
  loading: {
    padding: 24,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowSelected: {
    backgroundColor: '#f5f5f5',
  },
  name: {
    fontSize: 16,
  },
  check: {
    fontSize: 18,
    color: '#000',
    fontWeight: '600',
  },
});
