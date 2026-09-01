import { Modal, View, Text, TextInput, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { showAlert } from '../lib/dialogs';
import { normalizeToE164 } from '../lib/contacts';
import { useTheme } from '../hooks/useTheme';
import { isAbortError, withWriteTimeout } from '../lib/timeoutSignal';
import { AppHeader } from './AppHeader';

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
  // State alone admits same-tick double taps; the ref guards synchronously.
  const saveInFlightRef = useRef(false);

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

    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      await withWriteTimeout(async (signal) => {
        const { error } = await supabase
          .from('my_people')
          .upsert(
            [
              {
                owner_id: userId,
                phone_number: normalized,
                contact_name: name.trim() || null,
              },
            ],
            { onConflict: 'owner_id,phone_number' }
          )
          .abortSignal(signal);
        if (error) throw error;
      });
      setName('');
      setPhone('');
      onSaved();
    } catch (err) {
      console.error('Failed to add person:', err);
      showAlert(
        'Could not add person',
        isAbortError(err)
          ? 'That took too long. Check your connection and try again.'
          : 'Something went wrong. Try again.'
      );
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        // conventions-ok: top-pinned two-field form — nothing reaches the
        // window bottom, so no bottom inset is needed (KI-005 rule).
        style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 12 }]}
      >
        <AppHeader
          title="Add person"
          left={{ kind: 'cancel' }}
          onLeft={handleClose}
          right={{ label: 'Save', onPress: handleSave, disabled: saving || !phone.trim() }}
        />
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
