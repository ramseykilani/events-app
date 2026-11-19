import { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { VideoTrack } from 'livekit-client';

// Web video tile (VideoTile.native.tsx renders @livekit/react-native's
// VideoView). A plain <video> element under react-native-web; the track
// attaches/detaches with the component, and adaptiveStream sizes the
// subscription to the element's real size.
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
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <View style={[styles.wrap, style]}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: fit,
          transform: mirror ? 'scaleX(-1)' : undefined,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
});
