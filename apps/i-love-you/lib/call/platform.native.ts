import { AudioSession, registerGlobals } from '@livekit/react-native';

// Native half of the call platform split. @livekit/react-native supplies
// WebRTC to livekit-client through registerGlobals (once, before any Room is
// created), and the native audio session must be started for a call and
// stopped after it — that is what routes call audio to the earpiece/speaker/
// Bluetooth and keeps it alive with the screen locked (UIBackgroundModes
// audio in app.config.js).
registerGlobals();

export const CALL_PLATFORM = 'native' as const;

export async function prepareCallAudio(): Promise<void> {
  await AudioSession.startAudioSession();
}

export async function releaseCallAudio(): Promise<void> {
  await AudioSession.stopAudioSession();
}

// Screen share from a phone needs a broadcast extension (iOS) / foreground
// service (Android) — not in this pass (FEATURES.md -> Calls, next steps).
export const canScreenShare = false;

export const canFlipCamera = true;

export function attachRemoteAudio(_track: unknown): void {}

export function detachRemoteAudio(_track: unknown): void {}
