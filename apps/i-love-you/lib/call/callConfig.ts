import type {
  AudioCaptureOptions,
  RoomOptions,
  ScreenShareCaptureOptions,
  TrackPublishOptions,
  VideoCaptureOptions,
  VideoCodec,
} from 'livekit-client';

// Call quality (FEATURES.md -> Calls; docs/i-love-you-design.md -> Calls).
// The bar the owner set: Discord-quality voice, the best video available in
// 2026, on a two-person call. Every number below is a choice with a reason.
// Pure data + one capability probe, so Jest pins it and both platforms share
// it (lib/call/platform*.ts only differ in native audio-session plumbing).

export type CallPlatform = 'web' | 'native';

// ----- Voice -----
// Opus at 64 kbps mono. Discord's default voice channel bitrate is 64 kbps,
// and Opus is perceptually transparent for speech well below that (~32 kbps)
// — 64 buys headroom for laughter, music in the room, and a good mic, at a
// cost a two-person call never notices. Mono on purpose: a phone or laptop
// mic is a single capsule, and a stereo encode doubles the bitrate for the
// same signal (forceStereo false).
export const VOICE_MAX_BITRATE = 64_000;

// DTX on: Opus sends ~nothing during silence. On a call that is half
// listening, that is real battery and bandwidth, and LiveKit inserts comfort
// noise so the line never sounds dead. RED on: each packet also carries the
// previous frame, so a lost packet costs nothing audible — the single biggest
// win for voice on lossy mobile networks, for a few kbps.
export const VOICE_DTX = true;
export const VOICE_RED = true;

// Screen-share audio (a video, music) is the opposite case: stereo, 128 kbps,
// and DTX OFF — DTX's silence detection clips quiet musical passages.
export const SCREEN_AUDIO_MAX_BITRATE = 128_000;

// Capture: the browser/OS voice processing chain. Echo cancellation is
// mandatory with speakers; noise suppression and AGC make a laptop on a
// kitchen table sound like a headset. voiceIsolation is Chrome's ML speech
// isolation where it exists (ignored elsewhere). Krisp (LiveKit Cloud's
// noise filter, @livekit/krisp-noise-filter) is the next step up and needs
// a LiveKit Cloud plan — FEATURES.md -> Calls, next steps.
export const AUDIO_CAPTURE: AudioCaptureOptions & { voiceIsolation?: boolean } = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  voiceIsolation: true,
  channelCount: 1,
};

// ----- Video -----
// Codec negotiation, best first with a safe fallback:
//   web:    AV1 when this browser can encode it (best quality per bit; SVC),
//           else VP9 (SVC), else VP8. LiveKit's backupCodec publishes a VP8
//           layer alongside AV1/VP9 only if the other side cannot decode the
//           primary, so the fallback costs nothing when it is not needed.
//   native: H.264. iOS and Android phones encode/decode it in hardware;
//           software AV1/VP9 on a phone costs battery and heat for a gain a
//           phone screen does not show. Every LiveKit client decodes H.264.
export function pickVideoCodec(platform: CallPlatform, encodableMimeTypes: string[]): VideoCodec {
  if (platform === 'native') return 'h264';
  const has = (mime: string) => encodableMimeTypes.some((m) => m.toLowerCase() === mime);
  if (has('video/av1')) return 'av1';
  if (has('video/vp9')) return 'vp9';
  return 'vp8';
}

export function browserEncodableCodecs(): string[] {
  try {
    const caps = (globalThis as { RTCRtpSender?: { getCapabilities?: (k: string) => { codecs: { mimeType: string }[] } | null } })
      .RTCRtpSender?.getCapabilities?.('video');
    return caps?.codecs.map((c) => c.mimeType) ?? [];
  } catch {
    return [];
  }
}

// Camera: 1080p30 on desktop web, 720p30 on phones (a phone's front camera
// and screen gain little from 1080p, and the encoder runs cooler).
export function cameraCapture(platform: CallPlatform, wide: boolean): VideoCaptureOptions {
  const hd = platform === 'web' && wide;
  return {
    resolution: hd
      ? { width: 1920, height: 1080, frameRate: 30 }
      : { width: 1280, height: 720, frameRate: 30 },
    facingMode: 'user',
  };
}

export function publishDefaults(platform: CallPlatform, codec: VideoCodec): TrackPublishOptions {
  const svc = codec === 'av1' || codec === 'vp9';
  return {
    audioPreset: { maxBitrate: VOICE_MAX_BITRATE },
    dtx: VOICE_DTX,
    red: VOICE_RED,
    forceStereo: false,
    videoCodec: codec,
    // AV1/VP9 publish one SVC stream (L3T3_KEY: three spatial, three
    // temporal layers) that the SFU thins per receiver; VP8/H.264 simulcast.
    ...(svc ? { scalabilityMode: 'L3T3_KEY', backupCodec: { codec: 'vp8' as const } } : { simulcast: true }),
    videoEncoding:
      platform === 'web'
        ? { maxBitrate: 3_000_000, maxFramerate: 30 }
        : { maxBitrate: 1_700_000, maxFramerate: 30 },
    // Two people looking at each other: keep frame rate, give resolution.
    degradationPreference: 'maintain-framerate',
    screenShareEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 },
  };
}

export function roomOptions(platform: CallPlatform, wide: boolean, codecs: string[]): RoomOptions {
  const codec = pickVideoCodec(platform, codecs);
  return {
    // Only fetch the resolution each video element is actually shown at,
    // and pause video nobody is looking at (a minimized dock).
    adaptiveStream: true,
    // Stop encoding layers no subscriber is receiving.
    dynacast: true,
    audioCaptureDefaults: AUDIO_CAPTURE,
    videoCaptureDefaults: cameraCapture(platform, wide),
    publishDefaults: publishDefaults(platform, codec),
    disconnectOnPageLeave: true,
  };
}

// Desktop screen share: text stays sharp (contentHint 'detail'), 1080p at
// 15 fps, system/tab audio included where the browser offers it, our own tab
// excluded from the picker.
export const SCREEN_SHARE_CAPTURE: ScreenShareCaptureOptions = {
  audio: true,
  contentHint: 'detail',
  resolution: { width: 1920, height: 1080, frameRate: 15 },
  selfBrowserSurface: 'exclude',
  systemAudio: 'include',
  suppressLocalAudioPlayback: true,
};

export const SCREEN_SHARE_PUBLISH: TrackPublishOptions = {
  audioPreset: { maxBitrate: SCREEN_AUDIO_MAX_BITRATE },
  dtx: false,
  red: false,
  forceStereo: true,
};
