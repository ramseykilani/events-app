import {
  AUDIO_CAPTURE,
  SCREEN_SHARE_PUBLISH,
  VOICE_MAX_BITRATE,
  pickVideoCodec,
  publishDefaults,
  roomOptions,
} from '../../lib/call/callConfig';

// Call quality choices (lib/call/callConfig.ts): pinned so a refactor cannot
// quietly drop the voice bitrate, RED, or the codec fallback.
describe('call configuration', () => {
  it('negotiates the best codec this browser can encode, H.264 on phones', () => {
    expect(pickVideoCodec('web', ['video/VP8', 'video/VP9', 'video/AV1'])).toBe('av1');
    expect(pickVideoCodec('web', ['video/VP8', 'video/VP9'])).toBe('vp9');
    expect(pickVideoCodec('web', ['video/VP8'])).toBe('vp8');
    expect(pickVideoCodec('native', ['video/AV1'])).toBe('h264');
  });

  it('AV1/VP9 publish SVC with a VP8 backup; VP8/H.264 simulcast', () => {
    expect(publishDefaults('web', 'av1')).toMatchObject({ scalabilityMode: 'L3T3_KEY', backupCodec: { codec: 'vp8' } });
    expect(publishDefaults('native', 'h264')).toMatchObject({ simulcast: true });
  });

  it('voice: Opus 64 kbps mono with DTX and RED; capture runs the full voice chain', () => {
    const p = publishDefaults('web', 'vp9');
    expect(p.audioPreset).toEqual({ maxBitrate: VOICE_MAX_BITRATE });
    expect(VOICE_MAX_BITRATE).toBe(64_000);
    expect(p).toMatchObject({ dtx: true, red: true, forceStereo: false });
    expect(AUDIO_CAPTURE).toMatchObject({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
  });

  it('screen-share audio is stereo and never DTX-clipped', () => {
    expect(SCREEN_SHARE_PUBLISH).toMatchObject({ dtx: false, forceStereo: true });
  });

  it('adaptive stream and dynacast are on; desktop captures 1080p', () => {
    const o = roomOptions('web', true, ['video/VP9']);
    expect(o).toMatchObject({ adaptiveStream: true, dynacast: true });
    expect(o.videoCaptureDefaults?.resolution).toMatchObject({ width: 1920, height: 1080 });
    expect(roomOptions('native', false, []).videoCaptureDefaults?.resolution).toMatchObject({ width: 1280 });
  });
});
