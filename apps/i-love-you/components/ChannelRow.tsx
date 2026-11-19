import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@family/design';
import { notifyLevel } from '../lib/channelSettings';
import { formatListTime } from '../lib/format';
import type { Channel } from '../lib/types';
import { ChannelIcon } from './ChannelIcon';

// One channel on the home surface. Unread is a quiet accent dot — never a
// number (design language §3/§9: no badges, no counts). A quiet or muted
// channel says so with a small tertiary glyph, so the list itself explains
// why one channel never buzzed.
export function ChannelRow({
  channel,
  selected,
  onPress,
  typing,
}: {
  channel: Channel;
  selected: boolean;
  onPress: () => void;
  typing: boolean;
}) {
  const theme = useTheme();
  const level = notifyLevel(channel);
  const preview = typing ? 'Typing…' : (channel.last_message_preview ?? 'No messages yet');
  const a11y = [
    channel.name,
    channel.unread ? 'unread' : null,
    level === 'quiet' ? 'delivers quietly' : level === 'none' ? 'muted' : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <TouchableOpacity
      style={[styles.row, selected && { backgroundColor: theme.selectedBg }]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected }}
      testID={`channel-row-${channel.name}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: theme.surfaceSecondary }]}>
        <ChannelIcon name={channel.icon} color={theme.textSecondary} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text
            style={[styles.name, { color: theme.textPrimary }, channel.unread && styles.nameUnread]}
            numberOfLines={1}
          >
            {channel.name}
          </Text>
          {level !== 'notify' ? (
            <Ionicons
              name={level === 'quiet' ? 'moon-outline' : 'notifications-off-outline'}
              size={14}
              color={theme.textTertiary}
              style={styles.levelIcon}
            />
          ) : null}
          <View style={styles.spacer} />
          {channel.last_message_at ? (
            <Text style={[styles.time, { color: theme.textTertiary }]}>{formatListTime(channel.last_message_at)}</Text>
          ) : null}
        </View>
        <View style={styles.previewLine}>
          <Text
            style={[styles.preview, { color: typing ? theme.textSecondary : theme.textSecondary }]}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {channel.unread ? (
            <View
              style={[styles.dot, { backgroundColor: theme.accent }]}
              testID={`unread-dot-${channel.name}`}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginHorizontal: 8,
    gap: 12,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 16, flexShrink: 1 },
  nameUnread: { fontWeight: '600' },
  levelIcon: { marginLeft: 6 },
  spacer: { flex: 1 },
  time: { fontSize: 12, marginLeft: 8 },
  previewLine: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  preview: { fontSize: 14, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
});
