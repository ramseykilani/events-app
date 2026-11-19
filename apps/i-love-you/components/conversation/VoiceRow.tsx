import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@family/design';
import { formatDuration } from '../../lib/format';

// The voice-note row both players render: play/pause, progress, time.
export function VoiceRow({
  playing,
  disabled,
  onToggle,
  position,
  duration,
  tint,
}: {
  playing: boolean;
  disabled: boolean;
  onToggle: () => void;
  position: number;
  duration: number;
  tint: string;
}) {
  const theme = useTheme();
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.play, { backgroundColor: theme.surfaceSecondary }]}
        onPress={onToggle}
        disabled={disabled}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
      >
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color={tint} />
      </TouchableOpacity>
      <View style={[styles.track, { backgroundColor: theme.border }]}>
        <View style={[styles.fill, { backgroundColor: theme.textSecondary, width: `${progress * 100}%` }]} />
      </View>
      <Text style={[styles.time, { color: theme.textSecondary }]}>
        {formatDuration(playing || position > 0 ? position : duration)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: 4, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 4 },
  time: { fontSize: 13, minWidth: 36, textAlign: 'right' },
});
