import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parsePhoneNumber } from 'libphonenumber-js';
import { router } from 'expo-router';
import { getAuthUserMessage } from '../../lib/authErrors';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/dialogs';
import { showError } from '../../lib/showError';
import { useTheme } from '../../hooks/useTheme';

const PRIVACY_POLICY_URL = 'https://shared-events.pages.dev/privacy.html';

const ORIENTATION_LINES = [
  'Found something you want to go to? Add it here and share it with the right people — instead of texting them one by one.',
  'When your people share something, it shows up on your calendar too.',
  "Your phone number is your account. We'll text a code to sign in, and it's how a friend shares an event with you.",
];

export default function SignInScreen() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const normalizePhone = (input: string): string | null => {
    try {
      const parsed = parsePhoneNumber(input, 'US');
      // isPossible() (not isValid()): incomplete stubs like "123" must not
      // reach Twilio, but reserved 555 test numbers are possible-and-invalid
      // and still have to sign in.
      return parsed?.isPossible() ? parsed.format('E.164') : null;
    } catch {
      return null;
    }
  };

  const handleSignIn = async () => {
    const normalized = normalizePhone(phone);
    if (!normalized) {
      showAlert('Invalid phone number', 'Please enter a valid phone number.');
      return;
    }
    // Guard against double-taps that race past the disabled button state and
    // would otherwise send two OTP SMS messages.
    if (submittingRef.current) return;

    submittingRef.current = true;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalized,
      });

      if (error) throw error;

      router.replace({
        pathname: '/(auth)/verify',
        params: { phone: normalized, sent: '1' },
      });
    } catch (err: unknown) {
      const friendly = getAuthUserMessage(err);
      if (friendly) {
        showAlert('Could not send code', friendly);
      } else {
        showError('Error', err);
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
      >
        <Text
          style={[
            styles.title,
            {
              color: theme.textPrimary,
              fontFamily: theme.titleFontFamily,
              fontWeight: theme.titleFontWeight,
            },
          ]}
          accessibilityRole="header"
        >
          Events
        </Text>
        <View style={styles.orientation}>
          {ORIENTATION_LINES.map((line) => (
            <Text key={line} style={[styles.body, { color: theme.textSecondary }]}>
              {line}
            </Text>
          ))}
        </View>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
          placeholder="+1 (555) 123-4567"
          placeholderTextColor={theme.textTertiary}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          editable={!loading}
          accessibilityLabel="Phone number"
        />
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primaryButtonBg }, loading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading }}
        >
          <Text style={[styles.buttonText, { color: theme.primaryButtonText }]}>
            {loading ? 'Sending...' : 'Send code'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
          activeOpacity={0.6}
          accessibilityRole="link"
          accessibilityLabel="Privacy policy"
          style={styles.privacyLink}
        >
          <Text style={[styles.privacyText, { color: theme.textTertiary }]}>
            Privacy policy
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    marginBottom: 16,
  },
  orientation: {
    gap: 16,
    marginBottom: 28,
    maxWidth: 420,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
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
  privacyLink: {
    alignSelf: 'center',
    marginTop: 20,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  privacyText: {
    fontSize: 14,
  },
});
