import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@family/design';
import { useAttachmentUrl } from '../../hooks/useAttachmentUrl';
import { VoiceRow } from './VoiceRow';
import type { TimelineMessage } from '../../lib/types';

// Voice note playback, web half (VoicePlayer.native.tsx uses expo-audio).
export function VoicePlayer({ message }: { message: TimelineMessage }) {
  const theme = useTheme();
  const { url } = useAttachmentUrl(message.attachment?.path || null);
  const src = message.previewUri ?? url;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const duration = message.attachment?.duration_ms ?? 0;

  useEffect(() => {
    if (!src || typeof Audio === 'undefined') return;
    const el = new Audio(src);
    audioRef.current = el;
    el.ontimeupdate = () => setPosition(el.currentTime * 1000);
    el.onended = () => {
      setPlaying(false);
      setPosition(0);
    };
    return () => {
      el.pause();
      audioRef.current = null;
    };
  }, [src]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  return <VoiceRow playing={playing} disabled={!src} onToggle={toggle} position={position} duration={duration} tint={theme.textPrimary} />;
}
