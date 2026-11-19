import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parsePhoneNumber } from 'libphonenumber-js';
import { router } from 'expo-router';
import { getAuthUserMessage, showAlert, showError, supabase } from '@family/infra';
import { PrimaryButton, useTheme } from '@family/design';

// Phone + SMS code, the family's one sign-in (apps/events/app/(auth)/sign-in.tsx).
// The orientation line says what this is before asking for a number.
const ORIENTATION_LINE =
  'A private place for the two of you: separate channels for different kinds of talk, and calls that sound like you are in the same room.';

const CONSENT_LINE =
  'By tapping Send code, you agree to receive one SMS sign-in code. Msg & data rates may apply.';

export default function SignInScreen() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const normalizePhone = (input: string): string | null => {
    try {
      const parsed = parsePhoneNumber(input, 'US');
      // isPossible() (not isValid()): stubs like "123" must not reach Twilio,
      // but reserved 555 test numbers are possible-and-invalid and still have
      // to sign in.
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
    // A double tap racing past the disabled state would send two SMS.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
      if (error) throw error;
      router.replace({ pathname: '/(auth)/verify', params: { phone: normalized, sent: '1' } });
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

  // Phone-width column on phones, a card-width column on wide screens.
  const columnWidth = Math.min(windowWidth - 48, 440);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 24) },
        ]}
      >
        <View style={[styles.content, { width: columnWidth }]}>
          <Text
            style={[
              styles.title,
              { color: theme.textPrimary, fontFamily: theme.titleFontFamily, fontWeight: theme.titleFontWeight },
            ]}
            accessibilityRole="header"
          >
            I Love You
          </Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{ORIENTATION_LINE}</Text>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Log in</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
            placeholder="+1 (555) 123-4567"
            placeholderTextColor={theme.textTertiary}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            editable={!loading}
            onSubmitEditing={handleSignIn}
            accessibilityLabel="Phone number"
          />
          <PrimaryButton label="Send code" onPress={handleSignIn} loading={loading} />
          <Text style={[styles.consent, { color: theme.textTertiary }]}>{CONSENT_LINE}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 24 },
  title: { fontSize: 32, marginBottom: 16 },
  body: { fontSize: 16, lineHeight: 24, marginBottom: 28 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    // One input grammar (Events audit UX-26): 16px text, radius 12.
    fontSize: 16,
    marginBottom: 16,
  },
  consent: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 16 },
});
