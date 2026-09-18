import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getAuthUserMessage } from '../../lib/authErrors';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/dialogs';
import { showError } from '../../lib/showError';
import { formatPhoneDisplay } from '../../lib/format';
import { useTheme } from '../../hooks/useTheme';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TextAction } from '../../components/TextAction';

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyScreen() {
  const params = useLocalSearchParams<{ phone?: string; sent?: string }>();
  const phone = params.phone ?? '';
  // A code was just sent from sign-in — start the cooldown so an accidental
  // tap on "Try again" doesn't fire a second SMS immediately.
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(
    params.sent === '1' ? RESEND_COOLDOWN_SECONDS : 0
  );
  const [resending, setResending] = useState(false);
  const theme = useTheme();
  const loadingSafetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifyInFlight = useRef(false);
  const resendInFlight = useRef(false);

  useEffect(
    () => () => {
      if (loadingSafetyTimer.current) clearTimeout(loadingSafetyTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!phone) {
      router.replace('/(auth)/sign-in');
    }
  }, [phone]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleResend = async () => {
    if (resendCooldown > 0 || resending || resendInFlight.current) return;

    resendInFlight.current = true;
    setResending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
      });

      if (error) throw error;

      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      showAlert('Code sent', 'A new verification code has been sent to your phone.');
    } catch (err: unknown) {
      const friendly = getAuthUserMessage(err);
      if (friendly) {
        showAlert('Could not resend', friendly);
      } else {
        showError('Failed to resend', err);
      }
    } finally {
      resendInFlight.current = false;
      setResending(false);
    }
  };

  const handleVerify = async () => {
    if (!code.trim()) {
      showAlert('Enter code', 'Please enter the verification code.');
      return;
    }
    if (verifyInFlight.current) return;

    verifyInFlight.current = true;
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token: code.trim(),
        type: 'sms',
      });

      if (error) throw error;

      // Auth state change will trigger navigation via root layout. If that
      // redirect stalls (e.g. session persistence hiccup), re-enable the form
      // after a grace period so the user isn't stranded on "Verifying...".
      loadingSafetyTimer.current = setTimeout(() => {
        verifyInFlight.current = false;
        setLoading(false);
      }, 10000);
    } catch (err: unknown) {
      const friendly = getAuthUserMessage(err);
      if (friendly) {
        showAlert('Verification failed', friendly);
      } else {
        showError('Verification failed', err);
      }
      verifyInFlight.current = false;
      setLoading(false);
    }
  };

  if (!phone) return null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.content}>
        <Text
          style={[
            styles.title,
            {
              color: theme.textPrimary,
              fontFamily: theme.titleFontFamily,
              fontWeight: theme.titleFontWeight,
            },
          ]}
        >
          Verify
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Enter the 6-digit code sent to {formatPhoneDisplay(phone)}
        </Text>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
          placeholder="000000"
          placeholderTextColor={theme.textTertiary}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          editable={!loading}
          accessibilityLabel="Verification code"
        />
        <PrimaryButton
          label="Verify"
          onPress={handleVerify}
          loading={loading}
          testID="verify-button"
        />
        <TouchableOpacity
          style={[
            styles.resendButton,
            (resendCooldown > 0 || resending || loading) && styles.resendButtonDisabled,
          ]}
          onPress={handleResend}
          disabled={resendCooldown > 0 || resending || loading}
          accessibilityRole="button"
          accessibilityState={{ disabled: resendCooldown > 0 || resending || loading }}
        >
          <Text style={[styles.resendButtonText, { color: theme.textSecondary }]}>
            {resending
              ? 'Sending...'
              : resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : "Didn't receive it? Try again"}
          </Text>
        </TouchableOpacity>
        {/* UX-04: sign-in router.replace()s here, so a mistyped number has no
            way back without an explicit exit. */}
        <TextAction
          label="Wrong number?"
          onPress={() => router.replace('/(auth)/sign-in')}
        />
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
    // The OTP digit field sits on the §4 display rung (was an off-scale 24px
    // tier, audit UX-06).
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 16,
  },
  resendButton: {
    marginTop: 16,
    // Real 44pt visible target (audit UX-10).
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  resendButtonDisabled: {
    opacity: 0.5,
  },
  resendButtonText: {
    fontSize: 16,
  },
});
