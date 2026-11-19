import { createHmac } from 'node:crypto';
import { webcrypto } from 'node:crypto';
import { buildLiveKitClaims, signLiveKitToken } from '../../supabase/functions/_shared/livekitToken';

// The livekit-token function's signer (Web Crypto HS256). Verified here with
// Node's own HMAC, so a regression in the base64url or signing input would
// fail before LiveKit rejects it.

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

const input = {
  apiKey: 'APIkey',
  apiSecret: 'a-long-test-secret-value',
  identity: 'user-1',
  name: 'Ramsey',
  room: 'couple-abc',
  ttlSeconds: 7200,
  nowSeconds: 1_800_000_000,
};

function b64urlDecode(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

describe('LiveKit access token', () => {
  it('grants exactly the couple room, nothing more', () => {
    const claims = buildLiveKitClaims(input);
    expect(claims).toEqual({
      iss: 'APIkey',
      sub: 'user-1',
      name: 'Ramsey',
      nbf: 1_800_000_000 - 10,
      exp: 1_800_000_000 + 7200,
      video: { room: 'couple-abc', roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
    });
    expect(claims.video).not.toHaveProperty('roomAdmin');
  });

  it('is a valid HS256 JWT over those claims', async () => {
    const token = await signLiveKitToken(input);
    const [h, p, sig] = token.split('.');
    expect(JSON.parse(b64urlDecode(h))).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(JSON.parse(b64urlDecode(p))).toEqual(buildLiveKitClaims(input));
    const expected = createHmac('sha256', input.apiSecret)
      .update(`${h}.${p}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(sig).toBe(expected);
  });
});
