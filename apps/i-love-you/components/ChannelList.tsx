import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TextAction, useTheme } from '@family/design';
import { useChat } from '../app/_context/ChatContext';
import { RetryLine } from './RetryLine';
import { RoomBanner } from './RoomBanner';
import { ChannelRow } from './ChannelRow';
import { ThemeSwatch } from './ThemeSwatch';
import { NotificationNudge } from './NotificationNudge';
import { useChatEngine } from '../app/_context/ChatContext';
import type { Channel } from '../lib/types';

// The home surface: the couple's channels, in their order. The header is the
// partner's name in the display face — the whole app is the two of you, so
// there is no inbox of people above it. Used as the whole screen on phones
// and as the left pane on desktop.
export function ChannelList({
  activeChannelId,
  onSelect,
  topInset = 0,
  bottomInset = 0,
}: {
  activeChannelId: string | null;
  onSelect: (channelId: string) => void;
  topInset?: number;
  bottomInset?: number;
}) {
  const theme = useTheme();
  const engine = useChatEngine();
  const channels = useChat((s) => s.channels);
  const typing = useChat((s) => s.typing);
  const partnerName = useChat((s) => s.couple?.partner_display_name ?? 'Your partner');
  const refreshFailed = useChat((s) => s.refreshFailed);
  const live = useChat((s) => s.live);

  const active = useMemo(() => channels.filter((c) => !c.archived_at), [channels]);
  const archivedCount = channels.length - active.length;

  return (
    <View style={[styles.container, { paddingTop: topInset + 12 }]}>
      <View style={styles.header}>
        <Text
          style={[
            styles.title,
            { color: theme.textPrimary, fontFamily: theme.titleFontFamily, fontWeight: theme.titleFontWeight },
          ]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {partnerName}
        </Text>
        <View style={styles.headerRight}>
          <ThemeSwatch />
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(app)/room')}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Your room: calls"
          >
            <Ionicons name="call-outline" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(app)/settings')}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
      {live === 'offline' ? (
        <Text style={[styles.status, { color: theme.textTertiary }]} accessibilityLiveRegion="polite">
          Reconnecting…
        </Text>
      ) : null}
      {refreshFailed ? <RetryLine onPress={() => void engine.refresh()} /> : null}
      <RoomBanner />
      <NotificationNudge />
      <FlatList<Channel>
        data={active}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: 12 + bottomInset }}
        renderItem={({ item }) => (
          <ChannelRow
            channel={item}
            selected={item.id === activeChannelId}
            typing={(typing[item.id] ?? 0) > Date.now()}
            onPress={() => onSelect(item.id)}
          />
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <TextAction label="Channels & order" tone="link" onPress={() => router.push('/(app)/channels')} />
            {archivedCount > 0 ? (
              <Text style={[styles.archivedHint, { color: theme.textTertiary }]}>
                Archived channels are there too
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            Your channels will appear here.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 8,
    paddingBottom: 12,
    minHeight: 56,
  },
  title: { fontSize: 28, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  status: { fontSize: 13, paddingHorizontal: 20, paddingBottom: 8 },
  footer: { paddingTop: 12, alignItems: 'center' },
  archivedHint: { fontSize: 13, marginTop: -4 },
  empty: { fontSize: 15, padding: 24, textAlign: 'center' },
});
