import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { parsePhoneNumber } from 'libphonenumber-js';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { showError } from '../../lib/showError';
import { useTheme } from '../../hooks/useTheme';

export default function SignInScreen() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const theme = useTheme();

  const normalizePhone = (input: string): string | null => {
    try {
      const parsed = parsePhoneNumber(input, 'US');
      return parsed ? parsed.format('E.164') : null;
    } catch {
      return null;
    }
  };

  const handleSignIn = async () => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      Alert.alert('Invalid phone number', 'Please enter a valid phone number.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalized,
      });

      if (error) throw error;

      router.replace({
        pathname: '/(auth)/verify',
        params: { phone: normalized },
      });
    } catch (err: unknown) {
      showError('Error', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Events</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Enter your phone number to continue</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
          placeholder="+1 (555) 123-4567"
          placeholderTextColor={theme.textTertiary}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primaryButtonBg }, loading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
        >
          <Text style={[styles.buttonText, { color: theme.primaryButtonText }]}>
            {loading ? 'Sending...' : 'Send code'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    marginBottom: 16,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
  },
});
