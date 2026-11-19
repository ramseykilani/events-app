import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@family/design';
import { ChannelList } from '../../components/ChannelList';
import { useLayout } from '../../hooks/useLayout';
import { openChannel } from '../../lib/navigation';
import { isMac } from '../../lib/shortcuts';

// Home. On phones this is the channel list. On desktop the list is already
// the left pane, so the right side is a quiet resting state until a channel
// is chosen.
export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();

  if (!wide) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ChannelList
          activeChannelId={null}
          onSelect={(id) => openChannel(id, false)}
          topInset={insets.top}
          bottomInset={insets.bottom}
        />
      </View>
    );
  }

  const mod = typeof navigator !== 'undefined' && isMac(navigator.platform ?? '') ? '⌘' : 'Ctrl';
  return (
    <View style={[styles.container, styles.resting, { backgroundColor: theme.background }]}>
      <Ionicons name="chatbubbles-outline" size={40} color={theme.textTertiary} />
      <Text style={[styles.restingText, { color: theme.textSecondary }]}>Choose a channel.</Text>
      <Text style={[styles.hint, { color: theme.textTertiary }]}>
        {mod} 1–9 opens one by its place, Alt ↑ ↓ steps through them.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  resting: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  restingText: { fontSize: 16 },
  hint: { fontSize: 13 },
});
