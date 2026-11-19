import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextAction, useTheme } from '@family/design';
import { useCall } from '../app/_context/CallContext';
import { useChat } from '../app/_context/ChatContext';

// "Natasha is in your room — Join." The drop-in room's presence line
// (FEATURES.md -> Drop-in room): shown wherever you are when your partner is
// sitting in the couple's room and you are not.
export function RoomBanner() {
  const theme = useTheme();
  const call = useCall();
  const partnerInRoom = useChat((s) => s.partnerInRoom);
  const partnerName = useChat((s) => s.couple?.partner_display_name ?? 'Your partner');
  if (!partnerInRoom || call.phase !== 'idle') return null;
  return (
    <View style={[styles.banner, { backgroundColor: theme.accentSoft }]} accessibilityLiveRegion="polite">
      <Ionicons name="radio-outline" size={18} color={theme.textPrimary} />
      <Text style={[styles.text, { color: theme.textPrimary }]} numberOfLines={1}>
        {partnerName} is in your room
      </Text>
      <TextAction
        label="Join"
        tone="link"
        onPress={() => void call.join({ ring: false, video: false })}
        accessibilityLabel={`Join ${partnerName} in your room`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 4,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    minHeight: 48,
  },
  text: { flex: 1, fontSize: 15 },
});
