import { Modal, View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { showAlert } from '../lib/dialogs';
import { showError } from '../lib/showError';
import { normalizeToE164 } from '../lib/contacts';
import { useTheme } from '../hooks/useTheme';

type Props = {
  visible: boolean;
  userId: string;
  peopleCount: number;
  onClose: () => void;
  onSaved: () => void;
};

export function ManualAddPersonModal({
  visible,
  userId,
  peopleCount,
  onClose,
  onSaved,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const handleClose = () => {
    setName('');
    setPhone('');
    onClose();
  };

  const handleSave = async () => {
    const normalized = normalizeToE164(phone.trim());
    if (!normalized) {
      showAlert(
        'Invalid phone number',
        'Enter a valid phone number, ideally with the country code (e.g. +1 416 555 1234).'
      );
      return;
    }

    if (peopleCount >= 50) {
      showAlert('Limit reached', 'You can add up to 50 people.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('my_people').upsert(
        [
          {
            owner_id: userId,
            phone_number: normalized,
            contact_name: name.trim() || null,
          },
        ],
        { onConflict: 'owner_id,phone_number' }
      );
      if (error) {
        showError('Error adding person', error);
        return;
      }
      setName('');
      setPhone('');
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 12 }]}
      >
        <View style={[styles.header, { borderBottomColor: theme.borderLight }]}>
          <TouchableOpacity onPress={handleClose} activeOpacity={0.6} accessibilityRole="button">
            <Text style={[styles.cancel, { color: theme.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Add person</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || !phone.trim()}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || !phone.trim() }}
          >
            <Text
              style={[
                styles.save,
                { color: theme.textPrimary },
                (saving || !phone.trim()) && { color: theme.textTertiary },
              ]}
            >
              Save
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.form}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Name (optional)</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
            placeholder="Name"
            placeholderTextColor={theme.textTertiary}
            value={name}
            onChangeText={setName}
            autoFocus
          />
          <Text style={[styles.label, { color: theme.textSecondary }]}>Phone number</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
            placeholder="+1 416 555 1234"
            placeholderTextColor={theme.textTertiary}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          <Text style={[styles.hint, { color: theme.textTertiary }]}>
            Include the country code for numbers outside the US.
          </Text>
        </View>
      </KeyboardAvoidingView>
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
    minHeight: 44,
  },
  cancel: {
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  save: {
    fontSize: 16,
    fontWeight: '600',
  },
  form: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  hint: {
    fontSize: 13,
    marginTop: 8,
  },
});
