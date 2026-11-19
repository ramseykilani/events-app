import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader, Chip, TextAction, useTheme } from '@family/design';
import { isAbortError, showAlert } from '@family/infra';
import { useChat, useChatEngine } from '../../_context/ChatContext';
import { Composer } from '../../../components/conversation/Composer';
import { MessageBubble } from '../../../components/conversation/MessageBubble';
import { MessageActionsSheet } from '../../../components/conversation/MessageActionsSheet';
import { ChannelSettingsSheet } from '../../../components/ChannelSettingsSheet';
import { ChannelIcon } from '../../../components/ChannelIcon';
import { RetryLine } from '../../../components/RetryLine';
import { RoomBanner } from '../../../components/RoomBanner';
import { CONTENT_MAX_WIDTH, useLayout } from '../../../hooks/useLayout';
import { describeChannel, isOn } from '../../../lib/channelSettings';
import { formatDayLabel, sameDay } from '../../../lib/format';
import { EMPTY_TIMELINE } from '../../../lib/timeline';
import type { Draft } from '../../../lib/chatEngine';
import type { TimelineMessage } from '../../../lib/types';

// A conversation (FEATURES.md -> Messaging). Opens instantly from the local
// cache, then the newest page; history pages in as you scroll up. The list is
// inverted so the newest message sits on the composer and new arrivals never
// shove what you are reading — when you have scrolled up, they wait behind a
// quiet "Jump to latest".

type Row =
  | { kind: 'message'; key: string; message: TimelineMessage; showMeta: boolean; seen: boolean }
  | { kind: 'day'; key: string; label: string };

const GROUP_GAP_MS = 5 * 60 * 1000;

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const channelId = id ?? '';
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const engine = useChatEngine();
  const { wide } = useLayout();
  const channel = useChat((s) => s.channels.find((c) => c.id === channelId));
  const channels = useChat((s) => s.channels);
  const timeline = useChat((s) => s.timelines[channelId] ?? EMPTY_TIMELINE);
  const lookup = useChat((s) => s.timelines);
  const me = useChat((s) => s.couple?.my_id ?? '');
  const partnerName = useChat((s) => s.couple?.partner_display_name ?? 'Your partner');
  const partnerRead = useChat((s) => s.partnerReads[channelId]);
  const typingUntil = useChat((s) => s.typing[channelId] ?? 0);
  const live = useChat((s) => s.live);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<TimelineMessage | null>(null);
  const [editing, setEditing] = useState<TimelineMessage | null>(null);
  const [actionsFor, setActionsFor] = useState<TimelineMessage | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [scrolledUp, setScrolledUp] = useState(false);
  const listRef = useRef<FlatList<Row>>(null);

  const load = useCallback(() => {
    setLoadFailed(false);
    engine.openChannel(channelId).catch(() => setLoadFailed(true));
  }, [engine, channelId]);

  useFocusEffect(
    useCallback(() => {
      load();
      setReplyTo(null);
      setEditing(null);
      setOpenOnly(false);
      return () => engine.closeChannel(channelId);
    }, [load, engine, channelId])
  );

  // Reading marks read: whenever the newest message changes while this
  // screen is up (and, on web, the window is actually visible).
  const newestId = timeline.messages[timeline.messages.length - 1]?.id;
  useEffect(() => {
    if (!channel) return;
    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (!scrolledUp) engine.markRead(channelId);
  }, [newestId, channel?.unread, channelId, engine, scrolledUp]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisible = () => document.visibilityState === 'visible' && engine.markRead(channelId);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [engine, channelId]);

  const completable = !!channel && isOn(channel, 'items_completable');
  const receipts = !!channel && isOn(channel, 'read_receipts');

  const findMessage = useCallback(
    (mid: string): TimelineMessage | null => {
      for (const tl of Object.values(lookup)) {
        const hit = tl.messages.find((m) => m.id === mid);
        if (hit) return hit;
      }
      return null;
    },
    [lookup]
  );

  const rows = useMemo<Row[]>(() => {
    const source = openOnly
      ? timeline.messages.filter((m) => !m.done_at && !m.deleted_at)
      : timeline.messages;
    // The one "Seen" sits under your newest message the partner has read.
    let seenId: string | null = null;
    if (receipts && partnerRead) {
      const at = Date.parse(partnerRead);
      for (let i = source.length - 1; i >= 0; i--) {
        const m = source[i];
        if (m.sender_id === me && !m.local && Date.parse(m.created_at) <= at) {
          seenId = m.id;
          break;
        }
      }
    }
    const out: Row[] = [];
    for (let i = 0; i < source.length; i++) {
      const m = source[i];
      const prev = source[i - 1];
      const next = source[i + 1];
      if (!prev || !sameDay(prev.created_at, m.created_at)) {
        out.push({ kind: 'day', key: `day-${m.id}`, label: formatDayLabel(m.created_at) });
      }
      const showMeta =
        !next ||
        next.sender_id !== m.sender_id ||
        Date.parse(next.created_at) - Date.parse(m.created_at) > GROUP_GAP_MS;
      out.push({ kind: 'message', key: m.id, message: m, showMeta, seen: m.id === seenId });
    }
    return out.reverse();
  }, [timeline.messages, openOnly, receipts, partnerRead, me]);

  const fail = (title: string, err: unknown) => {
    console.error(`${title}:`, err);
    showAlert(title, isAbortError(err) ? 'That took too long. Check your connection and try again.' : 'Something went wrong. Try again.');
  };

  const onSend = (draft: Draft) => {
    try {
      engine.send(channelId, draft);
      setReplyTo(null);
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (err) {
      fail('Could not send', err);
    }
  };

  const onEndReached = () => {
    if (loadingOlder || !timeline.hasOlder || openOnly) return;
    setLoadingOlder(true);
    engine
      .loadOlder(channelId)
      .catch((err) => console.error('older load failed:', err))
      .finally(() => setLoadingOlder(false));
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Inverted: offset 0 is the newest message.
    const up = e.nativeEvent.contentOffset.y > 240;
    if (up !== scrolledUp) setScrolledUp(up);
  };

  const editLast = () => {
    const mine = [...timeline.messages].reverse().find((m) => m.sender_id === me && m.kind === 'text' && !m.deleted_at && !m.local);
    if (mine) setEditing(mine);
  };

  if (!channel) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 12, paddingBottom: insets.bottom }]}>
        {!wide ? <AppHeader left={{ kind: 'back', label: 'Channels' }} onLeft={() => router.back()} /> : null}
        <Text style={[styles.missing, { color: theme.textSecondary }]}>This channel is not available.</Text>
      </View>
    );
  }

  const partnerTyping = typingUntil > Date.now();
  const description = describeChannel(channel);

  const settingsButton = (
    <TouchableOpacity
      style={styles.headerIcon}
      onPress={() => setSettingsOpen(true)}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${channel.name} settings`}
    >
      <Ionicons name="options-outline" size={22} color={theme.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.background, paddingTop: wide ? insets.top + 8 : insets.top + 12 }]}
    >
      {wide ? (
        <View style={[styles.wideHeader, { borderBottomColor: theme.borderLight }]}>
          <ChannelIcon name={channel.icon} color={theme.textSecondary} />
          <View style={styles.wideTitle}>
            <Text style={[styles.wideName, { color: theme.textPrimary }]} accessibilityRole="header" numberOfLines={1}>
              {channel.name}
            </Text>
            {description ? (
              <Text style={[styles.description, { color: theme.textTertiary }]} numberOfLines={1}>
                {description}
              </Text>
            ) : null}
          </View>
          {settingsButton}
        </View>
      ) : (
        <AppHeader
          title={channel.name}
          left={{ kind: 'back', label: 'Channels' }}
          onLeft={() => (router.canGoBack() ? router.back() : router.replace('/(app)'))}
          rightAccessory={settingsButton}
        />
      )}
      {live === 'offline' ? (
        <Text style={[styles.status, { color: theme.textTertiary }]} accessibilityLiveRegion="polite">
          Reconnecting… messages you send will go when you are back.
        </Text>
      ) : null}
      {loadFailed ? <RetryLine label="Could not load new messages. Retry" onPress={load} /> : null}
      {!wide ? <RoomBanner /> : null}
      {completable ? (
        <View style={styles.filters}>
          <Chip
            label={openOnly ? 'Showing open items' : 'Open items'}
            selected={openOnly}
            onPress={() => {
              const next = !openOnly;
              setOpenOnly(next);
              if (next) engine.loadOpenItems(channelId).catch((err) => console.error('open items failed:', err));
            }}
            accessibilityLabel={openOnly ? 'Show all messages' : 'Show only open items'}
          />
        </View>
      ) : null}
      <View style={styles.listWrap}>
        <FlatList<Row>
          ref={listRef}
          inverted
          data={rows}
          keyExtractor={(r) => r.key}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          onScroll={onScroll}
          scrollEventThrottle={100}
          maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            // Inverted: the footer is the top of history.
            timeline.fresh && !timeline.hasOlder && !openOnly ? (
              <Text style={[styles.start, { color: theme.textTertiary }]}>The beginning of {channel.name}.</Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
                {openOnly ? 'Nothing open. ✓' : timeline.fresh ? 'No messages yet.' : ''}
              </Text>
            </View>
          }
          renderItem={({ item }) =>
            item.kind === 'day' ? (
              <Text style={[styles.day, { color: theme.textTertiary }]}>{item.label}</Text>
            ) : (
              <View style={styles.measure}>
                <MessageBubble
                  message={item.message}
                  mine={item.message.sender_id === me}
                  me={me}
                  partnerName={partnerName}
                  completable={completable}
                  replyTarget={item.message.reply_to_id ? findMessage(item.message.reply_to_id) : undefined}
                  movedFromName={
                    item.message.moved_from_channel_id
                      ? (channels.find((c) => c.id === item.message.moved_from_channel_id)?.name ?? 'another channel')
                      : null
                  }
                  seen={item.seen}
                  showMeta={item.showMeta}
                  onActions={setActionsFor}
                  onToggleDone={(m) => engine.setDone(m.id, !m.done_at).catch((err) => fail('Could not update', err))}
                  onReact={(m, key) => engine.toggleReaction(m.id, key).catch((err) => fail('Could not react', err))}
                  onRetry={(m) => engine.retry(m.id)}
                  onDiscard={(m) => engine.discard(m.id)}
                />
              </View>
            )
          }
        />
        {scrolledUp ? (
          <View style={styles.jump} pointerEvents="box-none">
            <Chip
              label="Jump to latest"
              onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
              style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }}
            />
          </View>
        ) : null}
      </View>
      <Text style={[styles.typing, { color: theme.textTertiary }]} accessibilityLiveRegion="polite">
        {partnerTyping ? `${partnerName} is typing…` : ' '}
      </Text>
      <View style={[styles.composerWrap, { paddingBottom: insets.bottom }]}>
        {channel.archived_at ? (
          <View style={[styles.archived, { borderTopColor: theme.borderLight }]}>
            <Text style={[styles.archivedText, { color: theme.textSecondary }]}>This channel is archived.</Text>
            <TextAction
              label="Restore"
              tone="link"
              onPress={() => engine.setArchived(channelId, false).catch((err) => fail('Could not restore', err))}
            />
          </View>
        ) : (
          <View style={styles.measure}>
            <Composer
              channel={channel}
              replyTo={replyTo}
              editing={editing}
              onCancelReply={() => setReplyTo(null)}
              onCancelEdit={() => setEditing(null)}
              onSend={onSend}
              onSaveEdit={(m, body) => {
                setEditing(null);
                engine.edit(m.id, body).catch((err) => fail('Could not edit', err));
              }}
              onEditLast={editLast}
              onTyping={() => engine.notifyTyping(channelId)}
            />
          </View>
        )}
      </View>
      <MessageActionsSheet
        message={actionsFor}
        me={me}
        channels={channels}
        completable={completable}
        onClose={() => setActionsFor(null)}
        onReact={(m, key) => engine.toggleReaction(m.id, key).catch((err) => fail('Could not react', err))}
        onReply={(m) => {
          setEditing(null);
          setReplyTo(m);
        }}
        onEdit={(m) => {
          setReplyTo(null);
          setEditing(m);
        }}
        onToggleDone={(m) => engine.setDone(m.id, !m.done_at).catch((err) => fail('Could not update', err))}
        onMove={(m, target) => engine.move(m.id, target).catch((err) => fail('Could not move', err))}
        onDelete={(m) => engine.remove(m.id).catch((err) => fail('Could not delete', err))}
      />
      <ChannelSettingsSheet channel={channel} visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  missing: { fontSize: 16, textAlign: 'center', padding: 24 },
  wideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 20,
    paddingRight: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    minHeight: 52,
  },
  wideTitle: { flex: 1, minWidth: 0 },
  wideName: { fontSize: 18, fontWeight: '600' },
  description: { fontSize: 13 },
  headerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  status: { fontSize: 13, textAlign: 'center', paddingVertical: 6 },
  filters: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6 },
  listWrap: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingVertical: 8 },
  measure: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  day: { fontSize: 12, textAlign: 'center', paddingVertical: 12 },
  start: { fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, transform: [{ scaleY: -1 }] },
  emptyText: { fontSize: 15 },
  jump: { position: 'absolute', bottom: 8, left: 0, right: 0, alignItems: 'center' },
  typing: { fontSize: 13, paddingHorizontal: 20, minHeight: 18 },
  composerWrap: {},
  archived: { borderTopWidth: 1, alignItems: 'center', paddingVertical: 8 },
  archivedText: { fontSize: 15 },
});
