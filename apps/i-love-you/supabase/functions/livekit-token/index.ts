import { authenticate, jsonResponse } from '../_shared/http.ts';
import { LIVEKIT_TOKEN_TTL_SECONDS, signLiveKitToken } from '../_shared/livekitToken.ts';

// livekit-token (FEATURES.md -> Calls): mints a LiveKit access token for the
// caller's couple room — and only that room. Couple membership is checked
// server-side by room_for_member (service_role only); the client never names
// a room. Returns { token, url, room }: the LiveKit URL comes from the
// function's LIVEKIT_URL secret, so the app needs no LiveKit config of its
// own and moving LiveKit projects is a secrets change, not a release.
//
// Secrets (SETUP.md -> LiveKit): LIVEKIT_URL, LIVEKIT_API_KEY,
// LIVEKIT_API_SECRET. Missing any of them answers 503 so the call UI can say
// "Calls are not set up" instead of failing mysteriously.

Deno.serve(async (req) => {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const url = Deno.env.get('LIVEKIT_URL');
  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!url || !apiKey || !apiSecret) {
    return jsonResponse({ error: 'Calls are not configured' }, 503);
  }

  const { data, error } = await auth.db.rpc('room_for_member', { p_caller: auth.callerId });
  if (error) return jsonResponse({ error: 'Lookup failed' }, 500);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.room) return jsonResponse({ error: 'Not paired' }, 403);

  const token = await signLiveKitToken({
    apiKey,
    apiSecret,
    identity: auth.callerId,
    name: row.display_name,
    room: row.room,
    ttlSeconds: LIVEKIT_TOKEN_TTL_SECONDS,
  });
  return jsonResponse({ token, url, room: row.room });
});
