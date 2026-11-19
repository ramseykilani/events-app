import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';

// Voice notes, phone half: expo-audio's HIGH_QUALITY preset (AAC in an M4A
// container, which every client — including the desktop browser — plays).
export type VoiceRecording = { uri: string; mime: string; name: string; duration_ms: number };

const MAX_MS = 5 * 60 * 1000;

export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => clearTimer, []);

  const start = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) throw Object.assign(new Error('Microphone permission denied'), { name: 'NotAllowedError' });
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    startedRef.current = Date.now();
    setRecording(true);
    timerRef.current = setInterval(() => {
      const ms = Date.now() - startedRef.current;
      setElapsedMs(ms);
      if (ms >= MAX_MS) void recorder.stop();
    }, 200);
  }, [recorder]);

  const finish = useCallback(async () => {
    clearTimer();
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    setRecording(false);
    setElapsedMs(0);
  }, [recorder]);

  const stop = useCallback(async (): Promise<VoiceRecording | null> => {
    const duration = Date.now() - startedRef.current;
    await finish();
    if (!recorder.uri || duration < 600) return null;
    return { uri: recorder.uri, mime: 'audio/mp4', name: 'voice.m4a', duration_ms: duration };
  }, [finish, recorder]);

  const cancel = useCallback(() => {
    void finish();
  }, [finish]);

  return { supported: true, recording, elapsedMs, start, stop, cancel };
}
