import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
} from 'react-native';
import { getContactsWithPhones } from '../lib/contacts';
import type { ContactWithPhone } from '../lib/contacts';
import { useTheme } from '../hooks/useTheme';

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
  const theme = useTheme();
  const [contacts, setContacts] = useState<ContactWithPhone[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const existingSet = new Set(existingPhones);

  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.trim();
    if (!q) return true;
    const qLower = q.toLowerCase();
    const name = (c.name ?? '').toLowerCase();
    const phoneDigits = c.normalized.replace(/\D/g, '');
    const queryDigits = q.replace(/\D/g, '');
    const matchesName = name.includes(qLower);
    const matchesPhone =
      queryDigits.length > 0 && phoneDigits.includes(queryDigits);
    return (
      matchesName ||
      matchesPhone
    );
  });

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
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.borderLight }]}>
          <TouchableOpacity onPress={onCancel}>
            <Text style={[styles.cancel, { color: theme.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Add people</Text>
          <TouchableOpacity onPress={handleConfirm}>
            <Text
              style={[
                styles.done,
                { color: theme.textPrimary },
                selected.size === 0 && { color: theme.textTertiary },
              ]}
            >
              Add {selected.size > 0 ? `(${selected.size})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <Text style={[styles.loading, { color: theme.textPrimary }]}>Loading contacts...</Text>
        ) : (
          <>
            <TextInput
              style={[styles.searchInput, { borderColor: theme.border, color: theme.textPrimary }]}
              placeholder="Search contacts..."
              placeholderTextColor={theme.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <FlatList
              data={filteredContacts}
              extraData={searchQuery}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isSelected = selected.has(item.normalized);
                return (
                  <TouchableOpacity
                    style={[
                      styles.row,
                      { borderBottomColor: theme.surfaceSecondary },
                      isSelected && { backgroundColor: theme.selectedBg },
                    ]}
                    onPress={() => toggle(item)}
                  >
                    <Text style={[styles.name, { color: theme.textPrimary }]}>
                      {item.name ?? item.phoneNumber}
                    </Text>
                    {isSelected && <Text style={[styles.check, { color: theme.textPrimary }]}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  cancel: {
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  done: {
    fontSize: 16,
    fontWeight: '600',
  },
  loading: {
    padding: 24,
    fontSize: 16,
  },
  searchInput: {
    marginHorizontal: 20,
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  name: {
    fontSize: 16,
  },
  check: {
    fontSize: 18,
    fontWeight: '600',
  },
});
