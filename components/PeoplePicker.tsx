import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getContactsWithPhones } from '../lib/contacts';
import type { ContactWithPhone } from '../lib/contacts';
import { formatPhoneDisplay } from '../lib/format';
import { useTheme } from '../hooks/useTheme';
import { withFetchTimeout } from '../lib/timeoutSignal';

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
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<ContactWithPhone[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const existingKey = existingPhones.join(',');

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
    let cancelled = false;
    setLoading(true);
    // expo-contacts can't consume an AbortSignal, so a single bounded
    // attempt — not withRetries, which would stack three overlapping
    // address-book reads it can't cancel.
    withFetchTimeout(() => getContactsWithPhones())
      .then((data) => {
        if (cancelled) return;
        const existing = new Set(existingKey ? existingKey.split(',') : []);
        setContacts(data.filter((c) => !existing.has(c.normalized)));
        setLoadError(false);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load contacts:', err);
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [existingKey, retryKey]);

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
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View
        style={[
          styles.container,
          { backgroundColor: theme.background, paddingTop: insets.top + 12 },
        ]}
      >
        <View style={[styles.header, { borderBottomColor: theme.borderLight }]}>
          <TouchableOpacity onPress={onCancel} activeOpacity={0.6} accessibilityRole="button">
            <Text style={[styles.cancel, { color: theme.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Add people</Text>
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={selected.size === 0}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityState={{ disabled: selected.size === 0 }}
          >
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
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={theme.textPrimary} />
            <Text style={[styles.loading, { color: theme.textSecondary }]}>
              Loading contacts...
            </Text>
          </View>
        ) : loadError ? (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: theme.textSecondary }]}>
              Couldn't load your contacts.
            </Text>
            <TouchableOpacity onPress={() => setRetryKey((k) => k + 1)} activeOpacity={0.6} accessibilityRole="button">
              <Text style={[styles.retry, { color: theme.linkText }]}>Retry</Text>
            </TouchableOpacity>
          </View>
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
              accessibilityLabel="Search contacts"
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
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={styles.rowText}>
                      <Text style={[styles.name, { color: theme.textPrimary }]}>
                        {item.name ?? formatPhoneDisplay(item.normalized)}
                      </Text>
                      {item.name ? (
                        <Text style={[styles.phone, { color: theme.textSecondary }]}>
                          {formatPhoneDisplay(item.normalized)}
                        </Text>
                      ) : null}
                    </View>
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
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  loading: {
    fontSize: 16,
  },
  errorContainer: {
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 16,
  },
  retry: {
    fontSize: 16,
    fontWeight: '600',
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
  rowText: {
    flex: 1,
    paddingRight: 12,
  },
  name: {
    fontSize: 16,
  },
  phone: {
    fontSize: 13,
    marginTop: 2,
  },
  check: {
    fontSize: 18,
    fontWeight: '600',
  },
});
