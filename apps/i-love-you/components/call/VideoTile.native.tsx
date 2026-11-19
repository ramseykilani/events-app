import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { VideoView } from '@livekit/react-native';
import type { VideoTrack } from 'livekit-client';

// Native video tile: @livekit/react-native's VideoView over the WebRTC view.
export function VideoTile({
  track,
  mirror = false,
  fit = 'cover',
  style,
}: {
  track: VideoTrack;
  mirror?: boolean;
  fit?: 'cover' | 'contain';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wrap, style]}>
      <VideoView videoTrack={track} mirror={mirror} objectFit={fit} style={styles.fill} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
