import { memo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useTheme } from '@family/design';
import { formatMessageTime } from '../../lib/format';
import { splitLinks } from '../../lib/links';
import { REACTIONS, reactorsLabel } from '../../lib/reactions';
import type { TimelineMessage } from '../../lib/types';
import { AttachmentImage } from './AttachmentImage';
import { VoicePlayer } from './VoicePlayer';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// One message. Yours sit right on the gentle accent tint (accentSoft — warmth,
// not a signal); your partner's sit left on the surface. Status words follow
// the design language's glyph law: plain "Sending…" while in flight,
// "✕ Not sent" when the server refused, "Seen" (information, not a
// confirmation) when read receipts are on, ✓ for a done item.

export type BubbleProps = {
  message: TimelineMessage;
  mine: boolean;
  me: string;
  partnerName: string;
  completable: boolean;
  replyTarget: TimelineMessage | null | undefined;
  movedFromName: string | null;
  seen: boolean;
  showMeta: boolean;
  onActions: (message: TimelineMessage) => void;
  onToggleDone: (message: TimelineMessage) => void;
  onReact: (message: TimelineMessage, key: string) => void;
  onRetry: (message: TimelineMessage) => void;
  onDiscard: (message: TimelineMessage) => void;
};

function Body({ text, color, linkColor }: { text: string; color: string; linkColor: string }) {
  return (
    <Text style={[styles.body, { color }]} selectable>
      {splitLinks(text).map((seg, i) =>
        seg.kind === 'link' ? (
          <Text
            key={i}
            style={[styles.link, { color: linkColor }]}
            onPress={() => void Linking.openURL(seg.url)}
            accessibilityRole="link"
          >
            {seg.text}
          </Text>
        ) : (
          <Text key={i}>{seg.text}</Text>
        )
      )}
    </Text>
  );
}

function BubbleImpl(props: BubbleProps) {
  const { message: m, mine, me, partnerName, completable, replyTarget, movedFromName, seen, showMeta } = props;
  const theme = useTheme();
  const [hover, setHover] = useState(false);
  const deleted = !!m.deleted_at;
  const done = !!m.done_at;
  const reactions = Object.entries(m.reactions ?? {}).filter(([, ids]) => ids.length > 0);

  const status = m.local?.status;
  const metaParts: string[] = [];
  if (showMeta || status) metaParts.push(formatMessageTime(m.created_at));
  if (m.edited_at && !deleted) metaParts.push('edited');

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      {completable && !deleted && !status ? (
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => props.onToggleDone(m)}
          activeOpacity={0.6}
          accessibilityRole="checkbox"
          accessibilityLabel={done ? 'Done. Mark as open' : 'Open. Mark as done'}
          accessibilityState={{ checked: done }}
          aria-checked={done}
          testID={done ? 'item-done' : 'item-open'}
        >
          {/* Circle = selectable, ✓ = done (design language §6). */}
          <View
            style={[
              styles.circle,
              { borderColor: done ? theme.accent : theme.border },
              done && { backgroundColor: theme.accent },
            ]}
          >
            {done ? <Ionicons name="checkmark" size={14} color={theme.calendarSelectedText} /> : null}
          </View>
        </TouchableOpacity>
      ) : null}
      <View style={[styles.column, mine ? styles.columnMine : styles.columnTheirs]}>
        {m.urgent && !deleted ? (
          <View style={styles.urgent}>
            <Ionicons name="alert-circle-outline" size={14} color={theme.textPrimary} />
            <Text style={[styles.urgentText, { color: theme.textPrimary }]}>Needs you now</Text>
          </View>
        ) : null}
        <Pressable
          onLongPress={() => !status && !deleted && props.onActions(m)}
          onHoverIn={() => setHover(true)}
          onHoverOut={() => setHover(false)}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityHint="Long press for message actions"
          accessibilityLabel={deleted ? 'Message deleted' : undefined}
          style={[
            styles.bubble,
            mine
              ? { backgroundColor: theme.accentSoft }
              : { backgroundColor: theme.surface, borderColor: theme.borderLight, borderWidth: 1 },
            done && styles.doneBubble,
          ]}
          testID={`message-${m.id}`}
        >
          {replyTarget !== undefined ? (
            <View style={[styles.quote, { borderLeftColor: theme.border }]}>
              <Text style={[styles.quoteText, { color: theme.textSecondary }]} numberOfLines={2}>
                {replyTarget === null
                  ? 'Replying to an earlier message'
                  : replyTarget.deleted_at
                    ? 'Message deleted'
                    : replyTarget.kind === 'image'
                      ? 'Photo'
                      : replyTarget.kind === 'voice'
                        ? 'Voice note'
                        : replyTarget.body}
              </Text>
            </View>
          ) : null}
          {deleted ? (
            <Text style={[styles.deleted, { color: theme.textTertiary }]}>Message deleted</Text>
          ) : (
            <>
              {m.kind === 'image' ? <AttachmentImage message={m} /> : null}
              {m.kind === 'voice' ? <VoicePlayer message={m} /> : null}
              {m.body ? (
                <Body
                  text={m.body}
                  color={done ? theme.textSecondary : theme.textPrimary}
                  linkColor={theme.linkText}
                />
              ) : null}
            </>
          )}
        </Pressable>
        {reactions.length > 0 ? (
          <View style={[styles.reactions, mine && styles.reactionsMine]}>
            {reactions.map(([key, ids]) => {
              const meta = REACTIONS.find((r) => r.key === key);
              if (!meta) return null;
              const mineReacted = ids.includes(me);
              const who = reactorsLabel(ids, me, partnerName);
              return (
                <TouchableOpacity
                  key={key}
                  // 44pt touch row around a compact pill: the target is real,
                  // the pill stays chat-sized.
                  style={styles.reactionHit}
                  onPress={() => props.onReact(m, key)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`${meta.label} from ${who}${mineReacted ? '. Remove yours' : '. Add yours'}`}
                >
                  <View
                    style={[
                      styles.reaction,
                      { backgroundColor: mineReacted ? theme.selectedBg : theme.surfaceSecondary },
                    ]}
                  >
                    <Ionicons name={meta.icon as IoniconName} size={14} color={theme.textPrimary} />
                    <Text style={[styles.reactionWho, { color: theme.textSecondary }]}>{who}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        {status === 'failed' ? (
          <View style={[styles.failRow, mine && styles.metaMine]}>
            <Text style={[styles.meta, { color: theme.textSecondary }]}>✕ Not sent</Text>
            <TouchableOpacity
              onPress={() => props.onRetry(m)}
              accessibilityRole="button"
              style={styles.failAction}
              activeOpacity={0.6}
            >
              <Text style={[styles.meta, { color: theme.linkText }]}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => props.onDiscard(m)}
              accessibilityRole="button"
              style={styles.failAction}
              activeOpacity={0.6}
            >
              <Text style={[styles.meta, { color: theme.textSecondary }]}>Discard</Text>
            </TouchableOpacity>
          </View>
        ) : metaParts.length > 0 || status === 'sending' || seen || movedFromName || done ? (
          <Text style={[styles.meta, mine && styles.metaMine, { color: theme.textTertiary }]}>
            {[
              status === 'sending' ? 'Sending…' : null,
              ...metaParts,
              done ? '✓ Done' : null,
              movedFromName ? `Moved from ${movedFromName}` : null,
              seen ? 'Seen' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
      </View>
      {Platform.OS === 'web' && hover && !status && !deleted ? (
        <TouchableOpacity
          style={[styles.more, { backgroundColor: theme.surfaceSecondary }]}
          onPress={() => props.onActions(m)}
          onPressIn={() => setHover(true)}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Message actions"
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={theme.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export const MessageBubble = memo(BubbleImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, marginVertical: 2 },
  rowMine: { flexDirection: 'row-reverse' },
  rowTheirs: {},
  column: { maxWidth: '78%' },
  columnMine: { alignItems: 'flex-end' },
  columnTheirs: { alignItems: 'flex-start' },
  bubble: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  doneBubble: { opacity: 0.75 },
  body: { fontSize: 16, lineHeight: 22 },
  link: { textDecorationLine: 'underline' },
  deleted: { fontSize: 15, fontStyle: 'italic' },
  quote: { borderLeftWidth: 3, paddingLeft: 8 },
  quoteText: { fontSize: 14 },
  urgent: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  urgentText: { fontSize: 13, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2, marginHorizontal: 4 },
  metaMine: { textAlign: 'right', alignSelf: 'flex-end' },
  failRow: { flexDirection: 'row', alignItems: 'center' },
  failAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -4, marginBottom: -8 },
  reactionsMine: { justifyContent: 'flex-end' },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  reactionHit: { minHeight: 44, justifyContent: 'center' },
  reactionWho: { fontSize: 12 },
  doneButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  more: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
});
