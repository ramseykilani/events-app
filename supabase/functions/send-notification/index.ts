import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// supabase-js always sends apikey and x-client-info alongside Authorization;
// all four must be allowed or the browser preflight blocks the call.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Internal-testing CTA (2026-08-17): while beta access is owner-gated
// (TestFlight / Play internal tracks), the SMS to recipients without an
// account invites them to email the owner to get signed up — an interested
// stranger has no other way in. App users already have the app, so their SMS
// stays a pure notification. At launch this line is replaced by store links
// for non-users, and app-user SMS gains an event deep link — same change,
// never one without the other (FEATURES.md → SMS Links at Launch).
const SIGNUP_INVITE_LINE =
  'Want to invite your friends to things too? Email kilani.ramsey@gmail.com to get signed up.';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(time: string): string {
  return new Date(`1970-01-01T${time}`).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// GSM-7 holds 160 chars per segment; one non-GSM-7 char forces UCS-2 (70
// chars/segment) and multiplies per-message cost. Normalize the punctuation
// that commonly leaks into OG titles/descriptions. (Emoji or CJK still send
// fine — they just price as UCS-2.)
function gsm7Safe(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00B7/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

// Word-boundary truncation so a 300-char OG title or a long description
// can't blow the message into many segments.
function excerpt(text: string, max: number): string {
  const clean = gsm7Safe(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}...`;
}

// Twilio accepts either MessagingServiceSid (sender pool, built-in STOP
// opt-out handling) or a bare From number — never both.
async function sendSms(
  to: string,
  body: string,
  accountSid: string,
  authToken: string,
  sender: { messagingServiceSid?: string; fromNumber?: string },
): Promise<void> {
  const credentials = btoa(`${accountSid}:${authToken}`);
  const params = new URLSearchParams({ To: to, Body: body });
  if (sender.messagingServiceSid) {
    params.set('MessagingServiceSid', sender.messagingServiceSid);
  } else if (sender.fromNumber) {
    params.set('From', sender.fromNumber);
  } else {
    return;
  }
  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    },
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller }, error: authError } = await authClient.auth.getUser();
  if (authError || !caller) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // Twilio config — account SID + auth token + a sender (messaging service SID
  // preferred, phone number as fallback) must be present or SMS is silently
  // skipped (push notifications are unaffected)
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioMessagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
  const twilioFromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
  const twilioConfigured = !!(
    twilioAccountSid &&
    twilioAuthToken &&
    (twilioMessagingServiceSid || twilioFromNumber)
  );
  const twilioSender = {
    messagingServiceSid: twilioMessagingServiceSid ?? undefined,
    fromNumber: twilioFromNumber ?? undefined,
  };

  const db = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Copy + Follow: eventId is the SENDER'S own events row id. Each
    // recipient's push carries that recipient's own row id (resolved below),
    // or tapping the notification lands on "Event not found".
    const { eventId, personIds } = await req.json();
    if (!eventId || typeof eventId !== 'string') {
      return jsonResponse({ error: 'eventId is required' }, 400);
    }
    // Optional scoping: the share screen passes the person ids it just
    // shared to, so an additive share notifies only the new recipients
    // instead of every sends row (KI-003). Absent = all rows, the pre-fix
    // behavior, kept for legacy callers.
    if (
      personIds !== undefined &&
      (!Array.isArray(personIds) ||
        personIds.some((id: unknown) => typeof id !== 'string'))
    ) {
      return jsonResponse({ error: 'personIds must be an array of strings' }, 400);
    }

    // Load the sender's row and verify the caller owns it.
    const { data: event, error: evErr } = await db
      .from('events')
      .select('owner_id, title, event_date, event_time, url, description')
      .eq('id', eventId)
      .single();

    if (evErr || !event) {
      return jsonResponse({ error: 'event not found' }, 404);
    }

    if (event.owner_id !== caller.id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    // Nothing new was shared — no one to notify.
    if (Array.isArray(personIds) && personIds.length === 0) {
      return jsonResponse({ sent: 0, sms: 0 });
    }

    const sharerUserId = event.owner_id;

    // Fetch the sharer's phone number and display name once. The name is the
    // preferred attribution everywhere; the phone is the fallback for
    // nameless accounts (the client gates sharing on a saved name, so this is
    // only pre-feature legacy state).
    const { data: sharerUser } = await db
      .from('users')
      .select('phone_number, display_name')
      .eq('id', sharerUserId)
      .single();
    const sharerPhone = sharerUser?.phone_number ?? 'Someone';
    const sharerDisplayName = (sharerUser?.display_name as string | null) ?? null;

    // Load the sends to notify for this event, including each recipient's
    // phone number — scoped to the just-shared person ids when the client
    // passes them.
    let sendsQuery = db
      .from('sends')
      .select('person_id, my_people(user_id, owner_id, phone_number)')
      .eq('event_id', eventId);
    if (personIds) {
      sendsQuery = sendsQuery.in('person_id', personIds);
    }
    const { data: sends, error: sendsErr } = await sendsQuery;

    if (sendsErr || !sends?.length) {
      return jsonResponse({ sent: 0, sms: 0 });
    }

    interface PushMessage {
      to: string;
      title: string;
      body: string;
      data: { eventId: string };
    }

    const messages: PushMessage[] = [];
    const smsSends: Promise<void>[] = [];

    const eventTitle = event.title ? excerpt(event.title, 80) : null;
    const dateStr = formatDate(event.event_date);
    const timeStr = event.event_time ? `, ${formatTime(event.event_time)}` : '';
    const dateLine = `${dateStr}${timeStr}`;
    const descriptionLine = event.description ? excerpt(event.description, 90) : null;

    // One message for both variants: the share framing (a share means "I
    // want to go with you", not "this exists"), event details, the event's
    // own URL when one exists, and the STOP footer — A2P best practice is
    // opt-out instructions on every message, and Twilio intercepts STOP
    // account-wide either way. No app/web links: the web app is a dev
    // surface, not somewhere we want first impressions, and link-free SMS
    // reads less like spam to carrier filters. The non-app variant also
    // carries SIGNUP_INVITE_LINE — the one acquisition element, kept
    // link-free. Launch pair (store link for non-users, event deep link
    // for app users) is FEATURES.md → SMS Links at Launch; not before
    // listings, never one variant without the other.
    function buildSmsBody(sharerName: string, signupInvite: boolean): string {
      const lines = [
        eventTitle
          ? `${sharerName} wants to go to "${eventTitle}" with you`
          : `${sharerName} wants to go to an event with you`,
        dateLine,
      ];
      if (descriptionLine) lines.push(descriptionLine);
      if (event.url) lines.push(event.url);
      if (signupInvite) lines.push('', SIGNUP_INVITE_LINE);
      lines.push('', 'Reply STOP to unsubscribe.');
      return lines.join('\n');
    }

    for (const send of sends) {
      const person = send.my_people as {
        user_id: string | null;
        owner_id: string;
        phone_number: string | null;
      } | null;

      if (!person) continue;

      // ── Non-app user: SMS only ──────────────────────────────────────────────
      if (!person.user_id) {
        if (!twilioConfigured || !person.phone_number) continue;

        // The SMS is the whole message for non-app recipients — there is no
        // other surface. This variant carries the signup invite.
        smsSends.push(
          sendSms(
            person.phone_number,
            buildSmsBody(sharerDisplayName ?? sharerPhone, true),
            twilioAccountSid!,
            twilioAuthToken!,
            twilioSender,
          ).catch(console.error),
        );
        continue;
      }

      // ── App user: push notification + SMS ──────────────────────────────────
      const recipientUserId = person.user_id;

      // Check if the sharer is hidden by the recipient: find the sharer in the
      // recipient's own my_people list (owner_id = recipient), then check
      // hidden_people for that person row.
      const { data: sharerInRecipientContacts } = await db
        .from('my_people')
        .select('id')
        .eq('owner_id', recipientUserId)
        .eq('user_id', sharerUserId)
        .maybeSingle();

      if (sharerInRecipientContacts) {
        const { data: hidden } = await db
          .from('hidden_people')
          .select('id')
          .eq('owner_id', recipientUserId)
          .eq('person_id', sharerInRecipientContacts.id)
          .maybeSingle();

        if (hidden) continue; // sharer is hidden — skip both push and SMS
      }

      // Get the sharer's contact name in the recipient's contacts
      const sharerName = sharerInRecipientContacts
        ? (
            await db
              .from('my_people')
              .select('contact_name, phone_number')
              .eq('id', sharerInRecipientContacts.id)
              .single()
          ).data
        : null;

      // Attribution order: the recipient's own label for the sharer, then the
      // sharer's chosen display name, then the raw phone number.
      const displayName =
        sharerName?.contact_name ?? sharerDisplayName ?? sharerPhone;

      // Queue push notification when the recipient has a token and has push
      // enabled. A missing token must not suppress the SMS below. The pref
      // columns are NOT NULL DEFAULT true; !== false keeps a missing users
      // row (shouldn't happen for an app user) on today's behavior.
      const { data: recipientUser } = await db
        .from('users')
        .select('expo_push_token, notify_push, notify_sms')
        .eq('id', recipientUserId)
        .single();

      // The push payload must carry the RECIPIENT'S own row id — row ids are
      // owner-scoped, so the sender's id would land on "Event not found".
      // share_event delivered the copy just before this call; if it is
      // missing (the recipient removed it in the race), skip the push and
      // still send the SMS.
      const { data: recipientCopy } = await db
        .from('events')
        .select('id')
        .eq('from_event_id', eventId)
        .eq('owner_id', recipientUserId)
        .maybeSingle();

      if (recipientCopy && recipientUser?.expo_push_token && recipientUser.notify_push !== false) {
        messages.push({
          to: recipientUser.expo_push_token,
          title: eventTitle
            ? `${displayName} wants to go to ${eventTitle} with you`
            : `${displayName} wants to go to an event with you`,
          body: dateLine,
          data: { eventId: recipientCopy.id },
        });
      }

      // Queue the same SMS unless the recipient turned text messages off.
      // Push is the tappable path for app users — the SMS is a pure
      // notification (no signup invite; they already have the app).
      // Skipped gracefully if Twilio is not configured.
      if (twilioConfigured && person.phone_number && recipientUser?.notify_sms !== false) {
        smsSends.push(
          sendSms(
            person.phone_number,
            buildSmsBody(displayName, false),
            twilioAccountSid!,
            twilioAuthToken!,
            twilioSender,
          ).catch(console.error),
        );
      }
    }

    // ── Send push notifications ─────────────────────────────────────────────
    if (messages.length > 0) {
      const pushResponse = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });

      const pushResult = await pushResponse.json();

      // Clear stale tokens for any DeviceNotRegistered receipts
      if (Array.isArray(pushResult.data)) {
        for (let i = 0; i < pushResult.data.length; i++) {
          if (pushResult.data[i]?.details?.error === 'DeviceNotRegistered') {
            const token = messages[i]?.to;
            if (token) {
              await db
                .from('users')
                .update({ expo_push_token: null })
                .eq('expo_push_token', token);
            }
          }
        }
      }
    }

    // ── Fire all SMS sends (already non-throwing via .catch) ────────────────
    await Promise.all(smsSends);

    return jsonResponse({ sent: messages.length, sms: smsSends.length });
  } catch (err) {
    console.error('send-notification error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
