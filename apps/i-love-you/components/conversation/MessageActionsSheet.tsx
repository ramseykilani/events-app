import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import * as Clipboard from 'expo-clipboard';
import { AppHeader, useTheme } from '@family/design';
import { showConfirm } from '@family/infra';
import { REACTIONS } from '../../lib/reactions';
import type { Channel, TimelineMessage } from '../../lib/types';
import { ChannelIcon } from '../ChannelIcon';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// Everything you can do with one message, in one sheet: react, reply, edit
// (yours), copy, move to another channel ("this belongs in heart-to-heart"),
// mark done (where the channel tracks items), delete (yours, confirmed —
// red, permanent for both of you).

type Props = {
  message: TimelineMessage | null;
  me: string;
  channels: Channel[];
  completable: boolean;
  onClose: () => void;
  onReact: (m: TimelineMessage, key: string) => void;
  onReply: (m: TimelineMessage) => void;
  onEdit: (m: TimelineMessage) => void;
  onToggleDone: (m: TimelineMessage) => void;
  onMove: (m: TimelineMessage, channelId: string) => void;
  onDelete: (m: TimelineMessage) => void;
};

export function MessageActionsSheet(props: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [moving, setMoving] = useState(false);
  const m = props.message;
  const close = () => {
    setMoving(false);
    props.onClose();
  };
  if (!m) return null;
  const mine = m.sender_id === props.me;
  const targets = props.channels.filter((c) => !c.archived_at && c.id !== m.channel_id);

  const Row = ({ icon, label, onPress, tone }: { icon: IoniconName; label: string; onPress: () => void; tone?: 'destructive' }) => (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={tone ? theme.destructiveLink : theme.textSecondary} />
      <Text style={[styles.rowText, { color: tone ? theme.destructiveLink : theme.textPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={[styles.scrim, { backgroundColor: theme.shadow }]} onPress={close} accessibilityRole="button" accessibilityLabel="Close message actions" />
      <View style={styles.anchor} pointerEvents="box-none">
        <View
          style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border, paddingBottom: insets.bottom + 8 }]}
          accessibilityViewIsModal
          role="dialog"
          aria-label="Message actions"
        >
          {moving ? (
            <>
              <AppHeader title="Move to" left={{ kind: 'back', label: 'Actions' }} onLeft={() => setMoving(false)} />
              <ScrollView style={styles.moveList}>
                {targets.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.row}
                    onPress={() => {
                      close();
                      props.onMove(m, c.id);
                    }}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={`Move to ${c.name}`}
                  >
                    <ChannelIcon name={c.icon} color={theme.textSecondary} />
                    <Text style={[styles.rowText, { color: theme.textPrimary }]}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={styles.reactions}>
                {REACTIONS.map((r) => {
                  const on = (m.reactions[r.key] ?? []).includes(props.me);
                  return (
                    <TouchableOpacity
                      key={r.key}
                      style={[styles.reaction, { backgroundColor: on ? theme.selectedBg : theme.surfaceSecondary }]}
                      onPress={() => {
                        close();
                        props.onReact(m, r.key);
                      }}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={on ? `Remove ${r.label}` : `React ${r.label}`}
                      accessibilityState={{ selected: on }}
                    >
                      <Ionicons name={r.icon as IoniconName} size={22} color={theme.textPrimary} />
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Row icon="arrow-undo-outline" label="Reply" onPress={() => { close(); props.onReply(m); }} />
              {mine && m.kind === 'text' ? (
                <Row icon="create-outline" label="Edit" onPress={() => { close(); props.onEdit(m); }} />
              ) : null}
              {m.body ? (
                <Row icon="copy-outline" label="Copy text" onPress={() => { close(); void Clipboard.setStringAsync(m.body ?? ''); }} />
              ) : null}
              {props.completable ? (
                <Row
                  icon={m.done_at ? 'ellipse-outline' : 'checkmark-circle-outline'}
                  label={m.done_at ? 'Mark as open' : 'Mark as done'}
                  onPress={() => { close(); props.onToggleDone(m); }}
                />
              ) : null}
              {targets.length > 0 ? (
                <Row icon="arrow-redo-outline" label="Move to another channel" onPress={() => setMoving(true)} />
              ) : null}
              {mine ? (
                <Row
                  icon="trash-outline"
                  label="Delete"
                  tone="destructive"
                  onPress={() =>
                    showConfirm('Delete message', 'It disappears for both of you. This cannot be undone.', {
                      confirmText: 'Delete',
                      destructive: true,
                      onConfirm: () => {
                        close();
                        props.onDelete(m);
                      },
                    })
                  }
                />
              ) : null}
              <Row icon="close-outline" label="Cancel" onPress={close} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, opacity: 0.35 },
  anchor: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 480,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    paddingTop: 12,
  },
  reactions: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, paddingBottom: 8 },
  reaction: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, paddingHorizontal: 20 },
  rowText: { fontSize: 16 },
  moveList: { maxHeight: 360 },
});
