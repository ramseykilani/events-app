import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader, PrimaryButton, SecondaryButton, TextAction, useTheme } from '@family/design';
import { isAbortError, showAlert, showConfirm, supabase } from '@family/infra';
import { api } from '../../lib/api';
import { formatPhoneDisplay } from '../../lib/format';
import { isMac, shortcutList } from '../../lib/shortcuts';
import { useNotificationPermission } from '../../hooks/useNotificationPermission';
import { useLayout } from '../../hooks/useLayout';
import { useSession } from '../_context/SessionContext';
import { useChat, useChatEngine } from '../_context/ChatContext';

// Settings for the person (per-channel settings live with each channel):
// your name, notifications on this device, desktop shortcuts, sign out,
// delete account.
export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const engine = useChatEngine();
  const { session } = useSession();
  const { wide } = useLayout();
  const myName = useChat((s) => s.couple?.my_display_name ?? '');
  const partnerName = useChat((s) => s.couple?.partner_display_name ?? 'your partner');
  const [name, setName] = useState(myName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const notifications = useNotificationPermission();

  useEffect(() => setName(myName), [myName]);

  const saveName = async () => {
    setSaving(true);
    try {
      await api.setDisplayName(name.trim());
      await engine.refresh();
      setSaved(true);
    } catch (err) {
      console.error('save name failed:', err);
      showAlert('Could not save your name', isAbortError(err) ? 'That took too long. Try again.' : 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const signOut = () => {
    const phone = session?.user?.phone;
    showConfirm('Sign out', `Sign out of ${phone ? formatPhoneDisplay(`+${phone.replace(/^\+/, '')}`) : 'this account'}?`, {
      confirmText: 'Sign Out',
      onConfirm: async () => {
        // This device stops receiving pushes for the account it leaves.
        if (Platform.OS !== 'web') await api.setPushToken(null).catch(() => {});
        const { error } = await supabase.auth.signOut();
        if (error) showAlert('Could not sign out', 'Something went wrong. Try again.');
      },
    });
  };

  const deleteAccount = () => {
    showConfirm(
      'Delete account',
      `This ends your space with ${partnerName}: every channel and message is deleted for both of you, and ${partnerName} goes back to pairing. This cannot be undone.`,
      {
        confirmText: 'Delete Account',
        destructive: true,
        onConfirm: async () => {
          try {
            await api.deleteMyAccount();
          } catch (err) {
            console.error('delete account failed:', err);
            showAlert('Could not delete account', 'Something went wrong. Try again.');
            return;
          }
          const { error } = await supabase.auth.signOut();
          if (error) showAlert('Could not sign out', 'Your account was deleted, but signing out failed. Try again.');
        },
      }
    );
  };

  const mac = Platform.OS === 'web' && typeof navigator !== 'undefined' && isMac(navigator.platform ?? '');
  const notifLabel = Platform.OS === 'web' ? 'Desktop notifications' : 'Notifications';
  const notifState = {
    granted: 'On. Each channel’s own setting decides how it notifies you.',
    denied:
      Platform.OS === 'web'
        ? 'Blocked in this browser. Allow notifications for this site in the browser’s settings.'
        : 'Off in your phone’s settings. Turn them on there for this app.',
    undetermined: 'Off.',
    unsupported:
      Platform.OS === 'web' ? 'This browser does not support notifications.' : 'Not available on this device.',
  }[notifications.state];

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 12 }]}>
      <AppHeader
        title="Settings"
        left={{ kind: 'back', label: 'Channels' }}
        onLeft={() => (router.canGoBack() ? router.back() : router.replace('/(app)'))}
      />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Text style={[styles.section, { color: theme.textSecondary }]}>Your name</Text>
          <View style={styles.nameRow}>
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.textPrimary }]}
              value={name}
              onChangeText={(t) => {
                setName(t.replace(/[\r\n]/g, ''));
                setSaved(false);
              }}
              maxLength={40}
              accessibilityLabel="Your name"
            />
            <PrimaryButton
              label="Save"
              size="compact"
              onPress={saveName}
              loading={saving}
              disabled={!name.trim() || name.trim() === myName}
            />
          </View>
          <Text style={[styles.hint, { color: theme.textTertiary }]}>
            {saved ? '✓ Saved.' : `${partnerName} sees this name.`}
          </Text>

          <Text style={[styles.section, { color: theme.textSecondary }]}>{notifLabel}</Text>
          <Text style={[styles.body, { color: theme.textPrimary }]}>{notifState}</Text>
          {notifications.state === 'undetermined' ? (
            <View style={styles.action}>
              <SecondaryButton label="Turn on notifications" size="compact" onPress={() => void notifications.ask()} />
            </View>
          ) : null}
          <Text style={[styles.hint, { color: theme.textTertiary }]}>
            Notifications come only from {partnerName}, titled with the channel they wrote in. Open a channel’s
            settings to make it loud, quiet or off.
          </Text>

          {Platform.OS === 'web' && wide ? (
            <>
              <Text style={[styles.section, { color: theme.textSecondary }]}>Keyboard</Text>
              {shortcutList(mac).map((s) => (
                <View key={s.keys} style={[styles.shortcut, { borderBottomColor: theme.borderLight }]}>
                  <Text style={[styles.keys, { color: theme.textPrimary, backgroundColor: theme.surfaceSecondary }]}>{s.keys}</Text>
                  <Text style={[styles.body, { color: theme.textSecondary, flex: 1 }]}>{s.action}</Text>
                </View>
              ))}
            </>
          ) : null}

          {Platform.OS === 'web' ? (
            <>
              <Text style={[styles.section, { color: theme.textSecondary }]}>Desktop app</Text>
              <Text style={[styles.hint, { color: theme.textTertiary }]}>
                Install this as an app from the browser’s address bar (Chrome, Edge) or File → Add to Dock (Safari)
                for its own window, notifications and a Dock or taskbar icon.
              </Text>
            </>
          ) : null}

          <View style={[styles.account, { borderTopColor: theme.borderLight }]}>
            <TextAction label="Sign out" onPress={signOut} style={styles.left} />
            <TextAction label="Delete account" tone="destructive" onPress={deleteAccount} style={styles.left} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { alignItems: 'center' },
  column: { width: '100%', maxWidth: 640, paddingHorizontal: 20 },
  section: { fontSize: 14, fontWeight: '600', marginTop: 24, marginBottom: 8 },
  nameRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16 },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  body: { fontSize: 15, lineHeight: 22 },
  action: { flexDirection: 'row', marginTop: 8 },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40, borderBottomWidth: 1 },
  keys: { fontSize: 13, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden', minWidth: 120 },
  account: { marginTop: 32, paddingTop: 12, borderTopWidth: 1, alignItems: 'flex-start' },
  left: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
