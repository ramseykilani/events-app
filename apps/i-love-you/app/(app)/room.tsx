import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { AppHeader, PrimaryButton, SecondaryButton, ThemedSwitch, useTheme } from '@family/design';
import { useCall } from '../_context/CallContext';
import { useChat } from '../_context/ChatContext';
import { VideoTile } from '../../components/call/VideoTile';
import { useLayout } from '../../hooks/useLayout';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// Your room (FEATURES.md -> Calls, Drop-in room). The couple has exactly one
// room. "Call" joins it and rings your partner; "Sit in the room" joins
// quietly — your partner sees you are there and can join with one tap, the
// way a Discord voice channel works. While connected this is the stage:
// partner's video (or their initial, ringed in accent while they speak),
// your preview, a shared screen when there is one, and the controls.
export default function RoomScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const call = useCall();
  const { wide } = useLayout();
  const partnerName = useChat((s) => s.couple?.partner_display_name ?? 'Your partner');
  const partnerInRoom = useChat((s) => s.partnerInRoom);
  const [startWithVideo, setStartWithVideo] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(app)'));
  const initial = partnerName.trim().charAt(0).toUpperCase() || '?';

  if (call.phase === 'idle') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 12 }]}>
        <AppHeader title="Your room" left={{ kind: 'back', label: 'Channels' }} onLeft={back} />
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom }]}>
          <View style={styles.column}>
            <View style={[styles.avatar, { backgroundColor: theme.surfaceSecondary, borderColor: partnerInRoom ? theme.accent : theme.border }]}>
              <Text style={[styles.initial, { color: theme.textPrimary, fontFamily: theme.titleFontFamily }]}>{initial}</Text>
            </View>
            <Text style={[styles.lead, { color: theme.textPrimary }]} accessibilityLiveRegion="polite">
              {partnerInRoom ? `${partnerName} is in your room.` : 'Nobody is in your room.'}
            </Text>
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              {partnerInRoom
                ? 'Join and you are talking.'
                : `Call rings ${partnerName}. Sitting in lets ${partnerName} see you are there and drop in whenever.`}
            </Text>
            {call.error ? (
              <Text style={[styles.error, { color: theme.linkText }]} accessibilityLiveRegion="assertive">
                {call.error}
              </Text>
            ) : null}
            <View style={styles.buttons}>
              {partnerInRoom ? (
                <PrimaryButton label={`Join ${partnerName}`} onPress={() => void call.join({ ring: false, video: startWithVideo })} />
              ) : (
                <>
                  <PrimaryButton label={`Call ${partnerName}`} onPress={() => void call.join({ ring: true, video: startWithVideo })} />
                  <SecondaryButton label="Sit in the room" onPress={() => void call.join({ ring: false, video: startWithVideo })} />
                </>
              )}
            </View>
            <TouchableOpacity
              style={styles.switchRow}
              onPress={() => setStartWithVideo((v) => !v)}
              activeOpacity={0.6}
              accessibilityRole="switch"
              accessibilityLabel="Start with camera on"
              accessibilityState={{ checked: startWithVideo }}
              aria-checked={startWithVideo}
            >
              <Text style={[styles.switchLabel, { color: theme.textPrimary }]}>Start with camera on</Text>
              <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no" aria-hidden>
                <ThemedSwitch value={startWithVideo} />
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  const status =
    call.phase === 'connecting'
      ? 'Connecting…'
      : call.phase === 'reconnecting'
        ? 'Reconnecting…'
        : call.partnerPresent
          ? call.partnerMuted
            ? `With ${partnerName} · ${partnerName} is muted`
            : `With ${partnerName}`
          : `Waiting for ${partnerName}…`;

  const Control = ({ icon, label, on, onPress }: { icon: IoniconName; label: string; on: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.control, { backgroundColor: on ? theme.surfaceSecondary : theme.selectedBg, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      aria-checked={on}
    >
      <Ionicons name={icon} size={24} color={theme.textPrimary} />
      <Text style={[styles.controlLabel, { color: theme.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );

  const main = call.partnerScreen ?? call.partnerVideo;
  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 12, paddingBottom: insets.bottom }]}>
      <AppHeader title="Your room" left={{ kind: 'back', label: 'Channels' }} onLeft={back} />
      <Text style={[styles.status, { color: theme.textSecondary }]} accessibilityLiveRegion="polite" testID="call-status">
        {status}
      </Text>
      <View style={[styles.stage, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
        {main ? (
          <VideoTile track={main} fit={call.partnerScreen ? 'contain' : 'cover'} style={styles.mainVideo} />
        ) : (
          <View style={styles.center}>
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: theme.surfaceSecondary,
                  borderColor: call.partnerSpeaking ? theme.accent : theme.border,
                  opacity: call.partnerPresent ? 1 : 0.5,
                },
              ]}
            >
              <Text style={[styles.initial, { color: theme.textPrimary, fontFamily: theme.titleFontFamily }]}>{initial}</Text>
            </View>
          </View>
        )}
        {call.partnerScreen && call.partnerVideo ? (
          <VideoTile track={call.partnerVideo} style={[styles.pip, styles.pipLeft, { borderColor: theme.border }]} />
        ) : null}
        {call.localVideo ? (
          <VideoTile track={call.localVideo} mirror style={[styles.pip, { borderColor: call.meSpeaking ? theme.accent : theme.border }]} />
        ) : null}
      </View>
      {call.error ? <Text style={[styles.error, { color: theme.linkText }]}>{call.error}</Text> : null}
      <View style={styles.controls}>
        <Control icon={call.micOn ? 'mic-outline' : 'mic-off-outline'} label={call.micOn ? 'Mute' : 'Unmute'} on={call.micOn} onPress={() => void call.toggleMic()} />
        <Control icon={call.cameraOn ? 'videocam-outline' : 'videocam-off-outline'} label="Camera" on={call.cameraOn} onPress={() => void call.toggleCamera()} />
        {call.canScreenShare && wide ? (
          <Control icon="desktop-outline" label={call.screenOn ? 'Stop sharing' : 'Share screen'} on={!call.screenOn} onPress={() => void call.toggleScreen()} />
        ) : null}
        {call.canFlipCamera && call.cameraOn ? (
          <Control icon="camera-reverse-outline" label="Flip" on onPress={() => void call.flipCamera()} />
        ) : null}
        <Control icon="exit-outline" label="Leave" on onPress={() => void call.leave()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { alignItems: 'center' },
  column: { width: '100%', maxWidth: 480, paddingHorizontal: 24, alignItems: 'center', paddingTop: 32 },
  avatar: { width: 112, height: 112, borderRadius: 56, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 32 },
  lead: { fontSize: 18, fontWeight: '500', marginTop: 20, textAlign: 'center' },
  hint: { fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center' },
  error: { fontSize: 14, marginTop: 12, textAlign: 'center', paddingHorizontal: 20 },
  buttons: { alignSelf: 'stretch', gap: 12, marginTop: 28 },
  switchRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, marginTop: 12 },
  switchLabel: { fontSize: 16 },
  status: { fontSize: 14, textAlign: 'center', paddingVertical: 8 },
  stage: { flex: 1, marginHorizontal: 16, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  mainVideo: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pip: { position: 'absolute', right: 12, bottom: 12, width: 160, height: 120, borderRadius: 10, borderWidth: 2 },
  pipLeft: { right: undefined, left: 12 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: 16, flexWrap: 'wrap' },
  control: { width: 84, minHeight: 64, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  controlLabel: { fontSize: 12 },
});
