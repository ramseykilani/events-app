import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type RemoteParticipant,
  type VideoTrack,
} from 'livekit-client';
import { api, CallsNotConfiguredError } from '../../lib/api';
import {
  SCREEN_SHARE_CAPTURE,
  SCREEN_SHARE_PUBLISH,
  browserEncodableCodecs,
  roomOptions,
} from '../../lib/call/callConfig';
import {
  CALL_PLATFORM,
  attachRemoteAudio,
  canFlipCamera,
  detachRemoteAudio,
  canScreenShare,
  prepareCallAudio,
  releaseCallAudio,
} from '../../lib/call/platform';
import { useChatEngine } from './ChatContext';

// The couple's room (FEATURES.md -> Calls, Drop-in room). One LiveKit room
// per couple; "Call" and "Sit in the room" both join it — Call also rings the
// partner (send-push kind 'ring'), sitting in does not. The Room object lives
// here, above the navigator, so the call survives moving between channels and
// the in-call dock can stay on screen everywhere.

export type CallPhase = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export type CallState = {
  phase: CallPhase;
  error: string | null;
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  partnerPresent: boolean;
  partnerMicOn: boolean;
  partnerSpeaking: boolean;
  meSpeaking: boolean;
  partnerVideo: VideoTrack | null;
  partnerScreen: VideoTrack | null;
  localVideo: VideoTrack | null;
  startedAt: number | null;
};

type CallApi = CallState & {
  join: (opts: { ring: boolean; video: boolean }) => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  flipCamera: () => Promise<void>;
  canScreenShare: boolean;
  canFlipCamera: boolean;
};

const INITIAL: CallState = {
  phase: 'idle',
  error: null,
  micOn: false,
  cameraOn: false,
  screenOn: false,
  partnerPresent: false,
  partnerMicOn: false,
  partnerSpeaking: false,
  meSpeaking: false,
  partnerVideo: null,
  partnerScreen: null,
  localVideo: null,
  startedAt: null,
};

const CallContext = createContext<CallApi | null>(null);

function videoOf(pub: LocalTrackPublication | undefined): VideoTrack | null {
  return (pub?.track as VideoTrack | undefined) ?? null;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const engine = useChatEngine();
  const { width } = useWindowDimensions();
  const [state, setState] = useState<CallState>(INITIAL);
  const roomRef = useRef<Room | null>(null);
  const joiningRef = useRef(false);

  const sync = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const partner: RemoteParticipant | undefined = Array.from(room.remoteParticipants.values())[0];
    const local = room.localParticipant;
    const partnerCam = partner?.getTrackPublication(Track.Source.Camera);
    const partnerScreen = partner?.getTrackPublication(Track.Source.ScreenShare);
    const partnerMic = partner?.getTrackPublication(Track.Source.Microphone);
    setState((s) => ({
      ...s,
      micOn: local.isMicrophoneEnabled,
      cameraOn: local.isCameraEnabled,
      screenOn: local.isScreenShareEnabled,
      partnerPresent: !!partner,
      partnerMicOn: !!partnerMic && !partnerMic.isMuted,
      partnerSpeaking: !!partner?.isSpeaking,
      meSpeaking: local.isSpeaking,
      partnerVideo: partnerCam && !partnerCam.isMuted ? ((partnerCam.track as VideoTrack | undefined) ?? null) : null,
      partnerScreen:
        partnerScreen && !partnerScreen.isMuted ? ((partnerScreen.track as VideoTrack | undefined) ?? null) : null,
      localVideo: videoOf(local.getTrackPublication(Track.Source.Camera)),
    }));
  }, []);

  const teardown = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    engine.setInRoom(false);
    setState((s) => ({ ...INITIAL, error: s.error }));
    if (room) {
      room.removeAllListeners();
      await room.disconnect().catch(() => {});
    }
    await releaseCallAudio().catch(() => {});
  }, [engine]);

  const join = useCallback(
    async ({ ring, video }: { ring: boolean; video: boolean }) => {
      if (roomRef.current || joiningRef.current) return;
      joiningRef.current = true;
      setState({ ...INITIAL, phase: 'connecting' });
      try {
        const { token, url } = await api.getCallToken();
        await prepareCallAudio();
        const room = new Room(roomOptions(CALL_PLATFORM, width >= 900, browserEncodableCodecs()));
        roomRef.current = room;
        room
          .on(RoomEvent.ParticipantConnected, sync)
          .on(RoomEvent.ParticipantDisconnected, sync)
          .on(RoomEvent.TrackSubscribed, (track) => {
            attachRemoteAudio(track);
            sync();
          })
          .on(RoomEvent.TrackUnsubscribed, (track) => {
            detachRemoteAudio(track);
            sync();
          })
          .on(RoomEvent.TrackMuted, sync)
          .on(RoomEvent.TrackUnmuted, sync)
          .on(RoomEvent.LocalTrackPublished, sync)
          .on(RoomEvent.LocalTrackUnpublished, sync)
          .on(RoomEvent.ActiveSpeakersChanged, sync)
          .on(RoomEvent.ConnectionStateChanged, (cs: ConnectionState) => {
            if (cs === ConnectionState.Reconnecting || cs === ConnectionState.SignalReconnecting) {
              setState((s) => ({ ...s, phase: 'reconnecting' }));
            } else if (cs === ConnectionState.Connected) {
              setState((s) => ({ ...s, phase: 'connected' }));
            }
          })
          .on(RoomEvent.Disconnected, () => {
            if (roomRef.current === room) void teardown();
          });
        // prepareConnection warms DNS/TLS/ICE while the token is in hand.
        await room.prepareConnection(url, token).catch(() => {});
        await room.connect(url, token);
        // Autoplay policy: the join tap is the user gesture that unlocks
        // audio playback in the browser.
        await room.startAudio().catch(() => {});
        engine.setInRoom(true);
        setState((s) => ({ ...s, phase: 'connected', startedAt: Date.now() }));
        if (ring) api.ringPartner();
        await room.localParticipant.setMicrophoneEnabled(true);
        if (video) await room.localParticipant.setCameraEnabled(true);
        sync();
      } catch (err) {
        console.error('call join failed:', err);
        const message =
          err instanceof CallsNotConfiguredError
            ? 'Calls are not set up on this server yet.'
            : (err as { name?: string })?.name === 'NotAllowedError'
              ? 'Microphone access was blocked. Allow it in your browser or system settings, then try again.'
              : 'Could not connect the call. Check your connection and try again.';
        await teardown();
        setState({ ...INITIAL, error: message });
      } finally {
        joiningRef.current = false;
      }
    },
    [engine, sync, teardown, width]
  );

  const leave = useCallback(async () => {
    setState((s) => ({ ...s, error: null }));
    await teardown();
  }, [teardown]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
    sync();
  }, [sync]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled);
    } catch (err) {
      console.error('camera toggle failed:', err);
      setState((s) => ({ ...s, error: 'The camera could not start. Check that it is allowed and not in use.' }));
    }
    sync();
  }, [sync]);

  const toggleScreen = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !canScreenShare) return;
    try {
      await room.localParticipant.setScreenShareEnabled(
        !room.localParticipant.isScreenShareEnabled,
        SCREEN_SHARE_CAPTURE,
        SCREEN_SHARE_PUBLISH
      );
    } catch (err) {
      // Cancelling the browser's picker lands here too — not an error worth
      // a message.
      if ((err as { name?: string })?.name !== 'NotAllowedError') console.error('screen share failed:', err);
    }
    sync();
  }, [sync]);

  const flipCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !canFlipCamera) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track as (VideoTrack & { restartTrack?: (o: object) => Promise<void> }) | undefined;
    const facing = (track?.mediaStreamTrack?.getSettings?.().facingMode as string | undefined) ?? 'user';
    await track?.restartTrack?.({ facingMode: facing === 'user' ? 'environment' : 'user' });
    sync();
  }, [sync]);

  // Leaving the app (sign-out unmounts the provider) ends the call.
  useEffect(() => () => void teardown(), [teardown]);

  const value = useMemo<CallApi>(
    () => ({
      ...state,
      join,
      leave,
      toggleMic,
      toggleCamera,
      toggleScreen,
      flipCamera,
      canScreenShare,
      canFlipCamera,
    }),
    [state, join, leave, toggleMic, toggleCamera, toggleScreen, flipCamera]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallApi {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall outside CallProvider');
  return ctx;
}
