import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Twilio StatusCallback webhook for share-notification SMS (Share Delivery
// Status, FEATURES.md). send-notification sets this function's URL as the
// per-message StatusCallback, which overrides the Messaging Service's
// callback — no Twilio console configuration. Deployed --no-verify-jwt
// (Twilio cannot present a user JWT), so the Twilio request signature is the
// only auth: fail closed when TWILIO_AUTH_TOKEN is unset.

// Statuses we record. 'queued' is already written at send time; everything
// else Twilio may send (accepted, sending, read, ...) is a no-op.
const RECORDED_STATUSES = ['sent', 'delivered', 'undelivered', 'failed'];
const TERMINAL_STATUSES = ['delivered', 'undelivered', 'failed'];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// X-Twilio-Signature = base64(HMAC-SHA1(authToken, url + each POST param
// key+value, sorted by key)). https://www.twilio.com/docs/usage/security
async function twilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
): Promise<string> {
  const data = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .reduce((acc, [key, value]) => acc + key + value, url);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!supabaseUrl || !serviceRoleKey || !authToken) {
    console.error('twilio-status: missing SUPABASE_URL, SERVICE_ROLE_KEY, or TWILIO_AUTH_TOKEN');
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  const provided = req.headers.get('X-Twilio-Signature');
  if (!provided) {
    return jsonResponse({ error: 'Missing signature' }, 403);
  }

  const params = new URLSearchParams(await req.text());

  // Twilio signs the exact URL it called. req.url should be that URL, but
  // accept the canonical constructed URL too in case the edge gateway
  // rewrites the request line.
  const candidates = new Set([
    req.url,
    `${supabaseUrl}/functions/v1/twilio-status`,
  ]);
  let valid = false;
  for (const url of candidates) {
    const expected = await twilioSignature(authToken, url, params);
    if (timingSafeEqual(expected, provided)) {
      valid = true;
      break;
    }
  }
  if (!valid) {
    console.error('twilio-status: signature mismatch', { url: req.url });
    return jsonResponse({ error: 'Invalid signature' }, 403);
  }

  const messageSid = params.get('MessageSid');
  const messageStatus = params.get('MessageStatus');
  const errorCode = params.get('ErrorCode');

  if (!messageSid || !messageStatus) {
    return jsonResponse({ error: 'MessageSid and MessageStatus are required' }, 400);
  }
  if (!RECORDED_STATUSES.includes(messageStatus)) {
    return jsonResponse({ ignored: messageStatus });
  }

  const db = createClient(supabaseUrl, serviceRoleKey);

  // Look up the share record by the message SID stored at send time. A miss
  // can be the send-time race (Twilio's first callback occasionally beats
  // send-notification's write of sms_sid) — answer 500 so Twilio retries.
  const { data: sendRow, error: lookupErr } = await db
    .from('sends')
    .select('id, sms_status')
    .eq('sms_sid', messageSid)
    .maybeSingle();

  if (lookupErr) {
    console.error('twilio-status: lookup failed', lookupErr);
    return jsonResponse({ error: lookupErr.message }, 500);
  }
  if (!sendRow) {
    console.error('twilio-status: no sends row for SID', { messageSid, messageStatus });
    return jsonResponse({ error: 'Unknown MessageSid' }, 500);
  }

  // Never let a late non-terminal callback downgrade a terminal state —
  // Twilio callbacks can arrive out of order or duplicated. Terminal states
  // last-write-wins among themselves.
  if (
    !TERMINAL_STATUSES.includes(messageStatus) &&
    sendRow.sms_status &&
    TERMINAL_STATUSES.includes(sendRow.sms_status)
  ) {
    return jsonResponse({ ignored: 'terminal-kept' });
  }

  const { error: updateErr } = await db
    .from('sends')
    .update({
      sms_status: messageStatus,
      sms_error_code: errorCode,
      sms_status_at: new Date().toISOString(),
    })
    .eq('id', sendRow.id);

  if (updateErr) {
    // 500 so Twilio retries the callback instead of dropping the state.
    console.error('twilio-status: update failed', updateErr);
    return jsonResponse({ error: updateErr.message }, 500);
  }
  return jsonResponse({ updated: 1 });
});
