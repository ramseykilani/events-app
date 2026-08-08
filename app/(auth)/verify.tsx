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
import { useTheme } from '../../hooks/useTheme';

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
          Enter the 6-digit code sent to {phone}
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
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primaryButtonBg }, loading && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading}
          testID="verify-button"
          accessibilityRole="button"
          accessibilityState={{ disabled: loading }}
        >
          <Text style={[styles.buttonText, { color: theme.primaryButtonText }]}>
            {loading ? 'Verifying...' : 'Verify'}
          </Text>
        </TouchableOpacity>
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
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
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
  resendButton: {
    marginTop: 16,
    padding: 12,
    alignItems: 'center',
  },
  resendButtonDisabled: {
    opacity: 0.5,
  },
  resendButtonText: {
    fontSize: 16,
  },
});
