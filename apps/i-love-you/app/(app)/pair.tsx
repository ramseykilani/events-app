import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { PrimaryButton, SecondaryButton, TextAction, useTheme } from '@family/design';
import { isAbortError, showAlert, showConfirm, supabase } from '@family/infra';
import { api, type JoinStatus } from '../../lib/api';
import { formatInviteCode } from '../../lib/format';
import { useChat, useChatEngine } from '../_context/ChatContext';

// Pairing (FEATURES.md -> Pairing). Three steps, each one screen's worth:
//   1. Your name — what your partner will see.
//   2. Start our space (get a code) or Enter a code.
//   3. Waiting — the code, large and copyable, until the partner joins.
// There is no other way in: no contacts, no search, no invite links.

const JOIN_MESSAGES: Record<Exclude<JoinStatus, 'paired'>, string> = {
  invalid: 'That code did not match. Check it with your partner and try again.',
  expired: 'That code has expired. Ask your partner to open the app — it makes a fresh one.',
  own_code: 'That is your own code. Your partner enters it on their phone.',
  already_paired: 'You are already paired.',
  rate_limited: 'Too many tries. Wait a little while, then try again.',
};

// While waiting, Realtime announces the partner's arrival; the poll is the
// safety net for a dropped socket (the family's pull rule, bounded).
const WAITING_POLL_MS = 4000;

export default function PairScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const engine = useChatEngine();
  const phase = useChat((s) => s.phase);
  const couple = useChat((s) => s.couple);
  const [name, setName] = useState('');
  const [nameSaved, setNameSaved] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'choose' | 'enter'>('choose');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const busyRef = useRef(false);

  // Step 1 is skipped when the name already exists (a returning person, or
  // one who started a couple and came back).
  useEffect(() => {
    if (couple?.my_display_name) {
      setNameSaved(true);
      return;
    }
    let cancelled = false;
    api
      .getMyDisplayName()
      .then((existing) => {
        if (cancelled) return;
        if (existing) setName(existing);
        setNameSaved(!!existing);
      })
      // Unknown is treated as missing: asking again is harmless.
      .catch(() => !cancelled && setNameSaved(false));
    return () => {
      cancelled = true;
    };
  }, [couple?.my_display_name]);

  useEffect(() => {
    if (phase !== 'waiting') return;
    const t = setInterval(() => void engine.refresh(), WAITING_POLL_MS);
    return () => clearInterval(t);
  }, [phase, engine]);

  const run = async (fn: () => Promise<void>, failTitle: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error(`${failTitle}:`, err);
      showAlert(
        failTitle,
        isAbortError(err) ? 'That took too long. Check your connection and try again.' : 'Something went wrong. Try again.'
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const saveName = () =>
    run(async () => {
      await api.setDisplayName(name.trim());
      setNameSaved(true);
    }, 'Could not save your name');

  const start = () => run(() => engine.createCouple(), 'Could not start');

  const join = () =>
    run(async () => {
      const status = await engine.joinCouple(code);
      if (status !== 'paired') showAlert('Could not join', JOIN_MESSAGES[status]);
    }, 'Could not join');

  const cancel = () =>
    showConfirm('Stop waiting', 'Your code stops working. You can start again or enter a code instead.', {
      confirmText: 'Stop waiting',
      onConfirm: () => void run(() => engine.cancelInvite(), 'Could not cancel'),
    });

  const copy = async () => {
    if (!couple?.invite_code) return;
    await Clipboard.setStringAsync(couple.invite_code);
    setCopied(true);
  };

  const share = async () => {
    if (!couple?.invite_code) return;
    await Share.share({ message: `Our code for I Love You: ${formatInviteCode(couple.invite_code)}` }).catch(() => {});
  };

  const titleStyle = [
    styles.title,
    { color: theme.textPrimary, fontFamily: theme.titleFontFamily, fontWeight: theme.titleFontWeight },
  ];

  let content: React.ReactNode;
  if (nameSaved === null) {
    content = null;
  } else if (!nameSaved) {
    content = (
      <>
        <Text style={titleStyle} accessibilityRole="header">
          What should your partner call you?
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          This is the only name in the app. You can change it later in Settings.
        </Text>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
          placeholder="Your name"
          placeholderTextColor={theme.textTertiary}
          value={name}
          onChangeText={(t) => setName(t.replace(/[\r\n]/g, ''))}
          maxLength={40}
          autoCapitalize="words"
          autoFocus
          onSubmitEditing={() => name.trim() && void saveName()}
          accessibilityLabel="Your name"
        />
        <PrimaryButton label="Continue" onPress={saveName} loading={busy} disabled={!name.trim()} />
      </>
    );
  } else if (phase === 'waiting' && couple?.invite_code) {
    content = (
      <>
        <Text style={titleStyle} accessibilityRole="header">
          Your code
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Your partner signs in with their own number, chooses Enter a code, and types this. It works once, for
          seven days.
        </Text>
        <View style={[styles.codeBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text
            style={[styles.code, { color: theme.textPrimary }]}
            selectable
            accessibilityLabel={`Invite code ${couple.invite_code.split('').join(' ')}`}
            testID="invite-code"
          >
            {formatInviteCode(couple.invite_code)}
          </Text>
        </View>
        <View style={styles.row}>
          <SecondaryButton label="Copy code" onPress={copy} size="compact" />
          {Platform.OS !== 'web' ? <SecondaryButton label="Share" onPress={share} size="compact" /> : null}
        </View>
        {copied ? <Text style={[styles.confirm, { color: theme.textSecondary }]}>✓ Copied.</Text> : null}
        <Text style={[styles.waiting, { color: theme.textTertiary }]} accessibilityLiveRegion="polite">
          Waiting for your partner to join…
        </Text>
        <TextAction label="Stop waiting" onPress={cancel} />
      </>
    );
  } else if (mode === 'enter') {
    content = (
      <>
        <Text style={titleStyle} accessibilityRole="header">
          Enter your partner’s code
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Eight letters and numbers, from your partner’s screen.
        </Text>
        <TextInput
          style={[styles.input, styles.codeInput, { borderColor: theme.border, color: theme.textPrimary }]}
          placeholder="ABCD 2345"
          placeholderTextColor={theme.textTertiary}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={11}
          autoFocus
          onSubmitEditing={() => code.trim() && void join()}
          accessibilityLabel="Partner's code"
        />
        <PrimaryButton label="Join" onPress={join} loading={busy} disabled={code.replace(/\W/g, '').length < 8} />
        <TextAction label="I don’t have a code" onPress={() => setMode('choose')} />
      </>
    );
  } else {
    content = (
      <>
        <Text style={titleStyle} accessibilityRole="header">
          Just the two of you
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          One of you starts and gets a code; the other enters it. After that, nobody else can ever join.
        </Text>
        <View style={styles.stack}>
          <PrimaryButton label="Start our space" onPress={start} loading={busy} />
          <SecondaryButton label="Enter a code" onPress={() => setMode('enter')} disabled={busy} />
        </View>
      </>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 24) },
        ]}
      >
        <View style={styles.column}>
          {content}
          <TextAction
            label="Sign out"
            onPress={() =>
              showConfirm('Sign out', 'Sign out of this phone number?', {
                confirmText: 'Sign Out',
                onConfirm: () => void supabase.auth.signOut(),
              })
            }
            style={styles.signOut}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  column: { width: '100%', maxWidth: 488, paddingHorizontal: 24 },
  title: { fontSize: 28, marginBottom: 12 },
  body: { fontSize: 16, lineHeight: 24, marginBottom: 24 },
  input: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 16 },
  codeInput: { fontSize: 18, letterSpacing: 4, textAlign: 'center' },
  codeBox: { borderWidth: 1, borderRadius: 12, paddingVertical: 20, alignItems: 'center', marginBottom: 16 },
  code: { fontSize: 32, letterSpacing: 6, fontWeight: '300' },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  stack: { gap: 12 },
  confirm: { fontSize: 14, textAlign: 'center', marginTop: 12 },
  waiting: { fontSize: 14, textAlign: 'center', marginTop: 24 },
  signOut: { marginTop: 32 },
});
