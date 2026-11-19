import { useTheme } from '@family/design';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useAttachmentUrl } from '../../hooks/useAttachmentUrl';
import type { TimelineMessage } from '../../lib/types';
import { VoiceRow } from './VoiceRow';

// Voice note playback, phone half.
export function VoicePlayer({ message }: { message: TimelineMessage }) {
  const theme = useTheme();
  const { url } = useAttachmentUrl(message.attachment?.path || null);
  const src = message.previewUri ?? url;
  const player = useAudioPlayer(src ? { uri: src } : null);
  const status = useAudioPlayerStatus(player);
  const duration = message.attachment?.duration_ms ?? Math.round((status.duration ?? 0) * 1000);
  return (
    <VoiceRow
      playing={status.playing}
      disabled={!src}
      onToggle={() => {
        if (status.playing) player.pause();
        else {
          if (status.didJustFinish || (status.duration && status.currentTime >= status.duration)) void player.seekTo(0);
          player.play();
        }
      }}
      position={Math.round((status.currentTime ?? 0) * 1000)}
      duration={duration}
      tint={theme.textPrimary}
    />
  );
}
