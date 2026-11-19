// Web half of the call platform split (lib/call/platform.native.ts is the
// native half). The browser has WebRTC built in and manages its own audio
// routing, so there is nothing to prepare.
export const CALL_PLATFORM = 'web' as const;

export async function prepareCallAudio(): Promise<void> {}

export async function releaseCallAudio(): Promise<void> {}

export const canScreenShare =
  typeof navigator !== 'undefined' &&
  !!(navigator as Navigator & { mediaDevices?: { getDisplayMedia?: unknown } }).mediaDevices?.getDisplayMedia &&
  // Phones' browsers expose getDisplayMedia inconsistently and have nothing
  // useful to share; screen share is a desktop feature.
  !/Android|iPhone|iPad/i.test(navigator.userAgent ?? '');

export const canFlipCamera = false;

type AttachableTrack = { kind: string; attach: () => HTMLMediaElement; detach: () => HTMLMediaElement[] };

// The browser plays a remote audio track only once it is attached to an
// <audio> element (livekit-client's RoomAudioRenderer does the same). Native
// WebRTC plays remote audio on its own.
export function attachRemoteAudio(track: AttachableTrack): void {
  if (track.kind !== 'audio' || typeof document === 'undefined') return;
  const el = track.attach();
  el.setAttribute('data-ily-call-audio', 'true');
  el.style.display = 'none';
  document.body.appendChild(el);
}

export function detachRemoteAudio(track: AttachableTrack): void {
  if (track.kind !== 'audio') return;
  for (const el of track.detach()) el.remove();
}
