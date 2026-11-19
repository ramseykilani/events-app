import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton, themedScreenOptions, useTheme } from '@family/design';
import { useSession } from '../_context/SessionContext';
import { ChatProvider, useChat, useChatEngine } from '../_context/ChatContext';
import { CallProvider, useCall } from '../_context/CallContext';
import { ChannelList } from '../../components/ChannelList';
import { CallDock } from '../../components/CallDock';
import { LIST_PANE_WIDTH, useLayout } from '../../hooks/useLayout';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { stepChannel } from '../../lib/shortcuts';
import { openChannel } from '../../lib/navigation';
import { api } from '../../lib/api';
import {
  getPermission,
  presentIncoming,
  registerPushToken,
  setActiveChannel,
  setupResponseHandling,
  syncNotificationChannels,
} from '../../lib/notifications';
import { notifyLevel, settingValue } from '../../lib/channelSettings';

// The signed-in shell. One ChatEngine and one call room for the session,
// above the navigator, so conversations stay warm and a call survives
// navigation. Phones get the single-column stack; at desktop widths the
// channel list sits beside the conversation (FEATURES.md -> Desktop).

function activeChannelFrom(pathname: string): string | null {
  const m = /^\/channel\/([0-9a-f-]{36})/.exec(pathname);
  return m ? m[1] : null;
}

function Shell() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const engine = useChatEngine();
  const call = useCall();
  const phase = useChat((s) => s.phase);
  const channels = useChat((s) => s.channels);
  const partnerName = useChat((s) => s.couple?.partner_display_name ?? 'Your partner');
  const pathname = usePathname();
  const { wide } = useLayout();
  const activeChannelId = activeChannelFrom(pathname);
  const paired = phase === 'paired';

  // Pairing gate: no couple yet (or waiting for the partner) means the
  // pairing screen; a paired couple never sees it.
  useEffect(() => {
    if ((phase === 'unpaired' || phase === 'waiting') && pathname !== '/pair') {
      router.replace('/(app)/pair');
    } else if (phase === 'paired' && pathname === '/pair') {
      router.replace('/(app)');
    }
  }, [phase, pathname]);

  useEffect(() => {
    setActiveChannel(activeChannelId);
  }, [activeChannelId]);

  // Incoming partner messages → desktop notification (web; phones get push).
  useEffect(
    () => engine.onIncoming((message, channel) => presentIncoming(message, channel, partnerName)),
    [engine, partnerName]
  );

  useEffect(
    () =>
      setupResponseHandling({
        openChannel: (id) => openChannel(id, wide),
        reply: async (channelId, text, replyToId) => {
          engine.send(channelId, { body: text, replyToId });
        },
        openRoom: () => router.push('/(app)/room'),
      }),
    [engine, wide]
  );

  // Register the push token once permission exists (never prompts here).
  useEffect(() => {
    if (!paired || Platform.OS === 'web') return;
    getPermission()
      .then(async (p) => {
        if (p !== 'granted') return;
        const token = await registerPushToken();
        if (token) await api.setPushToken(token);
      })
      .catch((err) => console.error('push registration failed:', err));
  }, [paired]);

  // Android notification channels follow the app's channels: name, level and
  // sound. The signature keeps unrelated updates (a new message) from
  // re-running the sync.
  const notificationSignature = useMemo(
    () =>
      channels
        .map((c) => `${c.id}:${c.name}:${c.archived_at ? 1 : 0}:${notifyLevel(c)}:${settingValue(c, 'notify_sound')}`)
        .join('|'),
    [channels]
  );
  useEffect(() => {
    if (paired) void syncNotificationChannels(channels);
    // eslint-style exhaustive deps are deliberate: the signature is the dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationSignature, paired]);

  const activeIds = useMemo(() => channels.filter((c) => !c.archived_at).map((c) => c.id), [channels]);
  useKeyboardShortcuts((intent) => {
    if (!paired) return;
    if (intent.kind === 'channel-index') {
      const id = activeIds[intent.index];
      if (id) openChannel(id, wide);
    } else if (intent.kind === 'channel-step') {
      const id = stepChannel(activeIds, activeChannelId, intent.delta);
      if (id) openChannel(id, wide);
    } else if (intent.kind === 'toggle-mic') {
      if (call.phase !== 'idle') void call.toggleMic();
    } else if (intent.kind === 'settings') {
      router.push('/(app)/settings');
    }
  });

  const showPane = wide && paired;
  const showDock = call.phase !== 'idle' && pathname !== '/room';

  return (
    <View style={[styles.shell, { backgroundColor: theme.background }]}>
      {showPane ? (
        <View style={[styles.pane, { width: LIST_PANE_WIDTH, borderRightColor: theme.border }]}>
          <ChannelList
            activeChannelId={activeChannelId}
            onSelect={(id) => openChannel(id, true)}
            topInset={insets.top}
          />
          {showDock ? <CallDock /> : null}
          <View style={{ height: insets.bottom }} />
        </View>
      ) : null}
      <View style={styles.main}>
        {showDock && !showPane ? (
          <View style={{ paddingTop: insets.top }}>
            <CallDock />
          </View>
        ) : null}
        <Stack screenOptions={themedScreenOptions(theme)}>
          <Stack.Screen name="index" />
          <Stack.Screen name="pair" />
          <Stack.Screen name="channel/[id]" />
          <Stack.Screen name="channels" />
          <Stack.Screen name="new-channel" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="room" />
        </Stack>
      </View>
      {phase === 'booting' ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: theme.background }]}>
          <ActivityIndicator color={theme.textPrimary} />
        </View>
      ) : null}
      {phase === 'error' ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: theme.background }]}>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            Could not reach the server. Check your connection.
          </Text>
          <PrimaryButton label="Try again" onPress={() => void engine.refresh()} />
        </View>
      ) : null}
    </View>
  );
}

export default function AppLayout() {
  const { session } = useSession();
  const userId = session?.user?.id;
  if (!userId) return null;
  return (
    // key: a different account on the same device gets a fresh engine.
    <ChatProvider userId={userId} key={userId}>
      <CallProvider>
        <Shell />
      </CallProvider>
    </ChatProvider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row' },
  pane: { borderRightWidth: 1 },
  main: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  errorText: { fontSize: 16, textAlign: 'center' },
});
