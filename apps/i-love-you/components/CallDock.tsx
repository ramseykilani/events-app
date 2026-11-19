import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@family/design';
import { useCall } from '../app/_context/CallContext';
import { useChat } from '../app/_context/ChatContext';
import { formatDuration } from '../lib/format';

// The in-call dock (FEATURES.md -> Calls): present on every screen while you
// are in the room, so a call keeps going while you move between channels.
// Desktop pins it to the foot of the channel pane (where Discord keeps its
// voice panel); phones pin it under the status bar. Tapping the label opens
// the full room.
export function CallDock() {
  const theme = useTheme();
  const call = useCall();
  const partnerName = useChat((s) => s.couple?.partner_display_name ?? 'Your partner');
  const [, tick] = useState(0);

  useEffect(() => {
    if (call.phase !== 'connected') return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [call.phase]);

  if (call.phase === 'idle') return null;

  const status =
    call.phase === 'connecting'
      ? 'Connecting…'
      : call.phase === 'reconnecting'
        ? 'Reconnecting…'
        : call.partnerPresent
          ? `With ${partnerName} · ${formatDuration(Date.now() - (call.startedAt ?? Date.now()))}`
          : `Waiting for ${partnerName}`;

  return (
    <View style={[styles.dock, { backgroundColor: theme.surface, borderColor: theme.border }]} testID="call-dock">
      <TouchableOpacity
        style={styles.label}
        onPress={() => router.push('/(app)/room')}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={`In your room. ${status}. Open the room`}
      >
        <View
          style={[
            styles.presence,
            { backgroundColor: call.partnerPresent ? theme.accent : theme.surfaceSecondary, borderColor: theme.border },
          ]}
        />
        <View style={styles.texts}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Your room</Text>
          <Text style={[styles.status, { color: theme.textSecondary }]} numberOfLines={1}>
            {status}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.control, { backgroundColor: call.micOn ? theme.surfaceSecondary : theme.selectedBg }]}
        onPress={() => void call.toggleMic()}
        activeOpacity={0.6}
        accessibilityRole="switch"
        accessibilityLabel="Microphone"
        accessibilityState={{ checked: call.micOn }}
        aria-checked={call.micOn}
      >
        <Ionicons name={call.micOn ? 'mic-outline' : 'mic-off-outline'} size={20} color={theme.textPrimary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.control, { backgroundColor: theme.surfaceSecondary }]}
        onPress={() => void call.leave()}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="Leave the room"
      >
        <Ionicons name="exit-outline" size={20} color={theme.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  label: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 10 },
  presence: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  texts: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '600' },
  status: { fontSize: 13 },
  control: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
