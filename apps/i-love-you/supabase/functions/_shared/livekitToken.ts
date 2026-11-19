// LiveKit access tokens, signed with Web Crypto (HS256) so the edge function
// needs no SDK import and Jest can verify the exact claims. The claim shape
// follows LiveKit's access-token spec: iss = API key, sub = participant
// identity, name, nbf/exp, and a `video` grant scoped to one room.
//
// Grants are the minimum a two-person room needs: join, publish (mic,
// camera, screen), subscribe, and data (reserved for in-call signals). No
// roomAdmin, no roomCreate beyond auto-create on join, no recorder rights.

export type LiveKitTokenInput = {
  apiKey: string;
  apiSecret: string;
  identity: string;
  name: string;
  room: string;
  ttlSeconds: number;
  nowSeconds?: number;
};

export type LiveKitClaims = {
  iss: string;
  sub: string;
  name: string;
  nbf: number;
  exp: number;
  video: {
    room: string;
    roomJoin: true;
    canPublish: true;
    canSubscribe: true;
    canPublishData: true;
  };
};

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

export function buildLiveKitClaims(input: LiveKitTokenInput): LiveKitClaims {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  return {
    iss: input.apiKey,
    sub: input.identity,
    name: input.name,
    // A little clock-skew allowance between the edge and the media server.
    nbf: now - 10,
    exp: now + input.ttlSeconds,
    video: {
      room: input.room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };
}

export async function signLiveKitToken(input: LiveKitTokenInput): Promise<string> {
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = base64UrlJson(buildLiveKitClaims(input));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(input.apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

// Tokens only gate the join; LiveKit refreshes them for the life of the
// connection. Two hours covers a long call's reconnects without leaving a
// day-long credential around.
export const LIVEKIT_TOKEN_TTL_SECONDS = 2 * 60 * 60;
