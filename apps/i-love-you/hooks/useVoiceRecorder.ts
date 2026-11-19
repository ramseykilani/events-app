import { useCallback, useEffect, useRef, useState } from 'react';

// Voice notes, web half (hooks/useVoiceRecorder.native.ts is the phone half):
// MediaRecorder with the browser's best Opus container (WebM on Chromium and
// Firefox, MP4/AAC on Safari). Capture uses the same voice processing chain
// as calls so a note recorded on a laptop sounds like the call does.
export type VoiceRecording = { uri: string; mime: string; name: string; duration_ms: number };

const MAX_MS = 5 * 60 * 1000;

function pickMime(): string {
  const MR = (globalThis as { MediaRecorder?: { isTypeSupported?: (t: string) => boolean } }).MediaRecorder;
  for (const t of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    if (MR?.isTypeSupported?.(t)) return t;
  }
  return '';
}

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const supported = typeof window !== 'undefined' && typeof (window as { MediaRecorder?: unknown }).MediaRecorder !== 'undefined';

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setElapsedMs(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    streamRef.current = stream;
    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64_000 } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    rec.start(250);
    recorderRef.current = rec;
    startedRef.current = Date.now();
    setRecording(true);
    timerRef.current = setInterval(() => {
      const ms = Date.now() - startedRef.current;
      setElapsedMs(ms);
      if (ms >= MAX_MS) rec.stop();
    }, 200);
  }, []);

  const stop = useCallback(async (): Promise<VoiceRecording | null> => {
    const rec = recorderRef.current;
    if (!rec) return null;
    const duration = Date.now() - startedRef.current;
    const done = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    if (rec.state !== 'inactive') rec.stop();
    await done;
    const type = rec.mimeType.split(';')[0] || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type });
    cleanup();
    if (duration < 600 || blob.size === 0) return null;
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    return { uri: URL.createObjectURL(blob), mime: type, name: `voice.${ext}`, duration_ms: duration };
  }, [cleanup]);

  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null;
      rec.stop();
    }
    cleanup();
  }, [cleanup]);

  return { supported, recording, elapsedMs, start, stop, cancel };
}
