import { authenticate, jsonResponse } from '../_shared/http.ts';
import {
  buildMessagePush,
  buildRingPush,
  type PushMessage,
} from '../_shared/notificationPayload.ts';

// send-push (FEATURES.md -> Notifications): the sender's client invokes this
// fire-and-forget after a write lands. Person-triggered only — there is no
// broadcast, digest, or "you have unread" push anywhere in the app.
//
//   { kind: 'message', messageId } — notify the partner about a message.
//     claim_message_push decides (exactly once, sender only, the partner's
//     per-channel level; urgent overrides quiet/off) and returns the payload
//     inputs; buildMessagePush shapes it.
//   { kind: 'ring' } — "come to the room": one push a minute at most.
//
// Delivery is best effort: a push failure never fails the caller's write,
// which already landed. Expo's DeviceNotRegistered clears the dead token.
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  let body: { kind?: unknown; messageId?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  let message: PushMessage | null = null;
  if (body.kind === 'message') {
    if (typeof body.messageId !== 'string') return jsonResponse({ error: 'messageId is required' }, 400);
    let row;
    try {
      const data = await auth.rpc('claim_message_push', { p_message_id: body.messageId, p_caller: auth.callerId });
      row = Array.isArray(data) ? data[0] : null;
    } catch (err) {
      console.error(err);
      return jsonResponse({ error: 'Claim failed' }, 500);
    }
    if (!row) return jsonResponse({ sent: 0 });
    message = buildMessagePush({
      token: row.partner_token,
      channel: { id: row.channel_id, name: row.channel_name },
      senderName: row.sender_name,
      message: { id: row.message_id, kind: row.message_kind, body: row.message_body, urgent: row.urgent },
      settings: row.partner_settings ?? {},
    });
  } else if (body.kind === 'ring') {
    let row;
    try {
      const data = await auth.rpc('claim_ring_push', { p_caller: auth.callerId });
      row = Array.isArray(data) ? data[0] : null;
    } catch (err) {
      console.error(err);
      return jsonResponse({ error: 'Claim failed' }, 500);
    }
    if (!row) return jsonResponse({ sent: 0 });
    message = buildRingPush(row.partner_token, row.caller_name);
  } else {
    return jsonResponse({ error: 'kind must be message or ring' }, 400);
  }

  if (!message) return jsonResponse({ sent: 0 });

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([message]),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await res.json();
    if (result?.data?.[0]?.details?.error === 'DeviceNotRegistered') {
      await auth.rpc('clear_push_token', { p_token: message.to }).catch(() => {});
    }
    return jsonResponse({ sent: 1 });
  } catch (err) {
    console.error('expo push failed', err);
    return jsonResponse({ sent: 0, error: 'Push delivery failed' }, 502);
  }
});
