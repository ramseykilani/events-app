import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader, Chip, PrimaryButton, useTheme } from '@family/design';
import { isAbortError, showAlert } from '@family/infra';
import { useChat, useChatEngine } from '../_context/ChatContext';
import { ChannelIcon } from '../../components/ChannelIcon';
import { ChannelSettingsSheet } from '../../components/ChannelSettingsSheet';
import { describeChannel } from '../../lib/channelSettings';
import type { Channel } from '../../lib/types';

// Channels & order (FEATURES.md -> Channels): either partner reorders,
// opens any channel's settings, archives and restores. Order is shared — the
// list is the same on both phones. Up/down controls rather than drag: they
// are reachable by keyboard and screen reader, and a list of a handful of
// channels never needs more.
export default function ChannelsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const engine = useChatEngine();
  const channels = useChat((s) => s.channels);
  const [settingsFor, setSettingsFor] = useState<Channel | null>(null);
  const [busy, setBusy] = useState(false);
  const active = channels.filter((c) => !c.archived_at);
  const archived = channels.filter((c) => c.archived_at);
  const settingsChannel = settingsFor ? channels.find((c) => c.id === settingsFor.id) ?? settingsFor : null;

  const fail = (title: string, err: unknown) => {
    console.error(`${title}:`, err);
    showAlert(title, isAbortError(err) ? 'That took too long. Check your connection and try again.' : 'Something went wrong. Try again.');
  };

  const move = async (index: number, delta: -1 | 1) => {
    const ids = active.map((c) => c.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length || busy) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setBusy(true);
    try {
      await engine.reorder(ids);
    } catch (err) {
      fail('Could not reorder', err);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (c: Channel) => {
    try {
      await engine.setArchived(c.id, false);
    } catch (err) {
      fail('Could not restore', err);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 12 }]}>
      <AppHeader
        title="Channels & order"
        left={{ kind: 'back', label: 'Channels' }}
        onLeft={() => (router.canGoBack() ? router.back() : router.replace('/(app)'))}
      />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.column}>
          <Text style={[styles.note, { color: theme.textTertiary }]}>
            Channels are yours to shape: names, icons, order and every setting. Changes show up for both of you.
          </Text>
          {active.map((c, i) => (
            <View key={c.id} style={[styles.row, { borderBottomColor: theme.borderLight }]}>
              <TouchableOpacity
                style={styles.rowMain}
                onPress={() => setSettingsFor(c)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`${c.name} settings`}
              >
                <ChannelIcon name={c.icon} color={theme.textSecondary} />
                <View style={styles.rowTexts}>
                  <Text style={[styles.name, { color: theme.textPrimary }]}>{c.name}</Text>
                  {describeChannel(c) ? (
                    <Text style={[styles.meta, { color: theme.textTertiary }]}>{describeChannel(c)}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.arrow}
                onPress={() => void move(i, -1)}
                disabled={i === 0 || busy}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Move ${c.name} up`}
                accessibilityState={{ disabled: i === 0 || busy }}
              >
                <Ionicons name="chevron-up" size={20} color={i === 0 ? theme.border : theme.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.arrow}
                onPress={() => void move(i, 1)}
                disabled={i === active.length - 1 || busy}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Move ${c.name} down`}
                accessibilityState={{ disabled: i === active.length - 1 || busy }}
              >
                <Ionicons
                  name="chevron-down"
                  size={20}
                  color={i === active.length - 1 ? theme.border : theme.textSecondary}
                />
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.create}>
            <PrimaryButton label="New channel" onPress={() => router.push('/(app)/new-channel')} />
          </View>
          {archived.length > 0 ? (
            <>
              <Text style={[styles.section, { color: theme.textSecondary }]}>Archived</Text>
              {archived.map((c) => (
                <View key={c.id} style={[styles.row, { borderBottomColor: theme.borderLight }]}>
                  <View style={styles.rowMain}>
                    <ChannelIcon name={c.icon} color={theme.textTertiary} />
                    <Text style={[styles.name, { color: theme.textSecondary }]}>{c.name}</Text>
                  </View>
                  <Chip label="Restore" onPress={() => void restore(c)} accessibilityLabel={`Restore ${c.name}`} />
                </View>
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>
      {settingsChannel ? (
        <ChannelSettingsSheet channel={settingsChannel} visible onClose={() => setSettingsFor(null)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { alignItems: 'center' },
  column: { width: '100%', maxWidth: 640, paddingHorizontal: 20 },
  note: { fontSize: 14, lineHeight: 20, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 60, borderBottomWidth: 1 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  rowTexts: { flex: 1 },
  name: { fontSize: 16 },
  meta: { fontSize: 13, marginTop: 2 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  create: { paddingVertical: 20 },
  section: { fontSize: 14, fontWeight: '600', marginTop: 8, marginBottom: 4 },
});
