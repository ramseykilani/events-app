import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendExpoPush, type PushMessage } from '../_shared/expoPush.ts';
import { buildSmsBody } from '../_shared/smsBody.ts';
import { isReservedTestPhone, sendSms } from '../_shared/twilioSms.ts';

// supabase-js always sends apikey and x-client-info alongside Authorization;
// all four must be allowed or the browser preflight blocks the call.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// NANP area code 555 is reserved / fictional — SMS to it is skipped.
// isReservedTestPhone and sendSms live in _shared/twilioSms.ts (shared with
// beta-signup); keep lib/reservedPhone.ts in sync.

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
      .select('owner_id, title, event_date, event_time, url, description, location')
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
    // passes them. sends.id is needed to write each SMS's delivery outcome
    // back onto the share record; response_token builds the Who's Coming
    // receipt link both SMS variants carry.
    let sendsQuery = db
      .from('sends')
      .select('id, person_id, response_token, my_people(user_id, owner_id, phone_number)')
      .eq('event_id', eventId);
    if (personIds) {
      sendsQuery = sendsQuery.in('person_id', personIds);
    }
    const { data: sends, error: sendsErr } = await sendsQuery;

    if (sendsErr || !sends?.length) {
      return jsonResponse({ sent: 0, sms: 0 });
    }

    const messages: PushMessage[] = [];
    const smsSends: Promise<void>[] = [];

    // Delivery-status webhook for every SMS this function sends. The URL is
    // deterministic, so the twilio-status function can verify Twilio's
    // signature against it.
    const smsStatusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-status`;

    // Send one SMS and persist the outcome on its sends row (Share Delivery
    // Status): accepted → message SID + 'queued' (terminal carrier states
    // arrive via twilio-status); synchronous rejection → 'failed' + the
    // 21xxx code (21610 STOP included — Twilio answers STOP'd numbers
    // synchronously). A lost status write degrades that row to the legacy
    // "✓ Shared" label; the SMS itself is already on its way.
    const sendAndRecord = async (
      sendId: string,
      to: string,
      body: string,
    ): Promise<void> => {
      const result = await sendSms(
        to,
        body,
        twilioAccountSid!,
        twilioAuthToken!,
        twilioSender,
        smsStatusCallbackUrl,
      );
      if (result.status === 'skipped') return;
      const update =
        result.status === 'sent'
          ? {
              sms_sid: result.sid,
              sms_status: 'queued',
              sms_error_code: null,
              sms_status_at: new Date().toISOString(),
            }
          : {
              sms_status: 'failed',
              sms_error_code: result.errorCode != null ? String(result.errorCode) : null,
              sms_status_at: new Date().toISOString(),
            };
      const { error } = await db.from('sends').update(update).eq('id', sendId);
      if (error) console.error('send-notification: status write failed', error);
    };

    const eventTitle = event.title ? excerpt(event.title, 80) : null;
    const dateStr = formatDate(event.event_date);
    const timeStr = event.event_time ? `, ${formatTime(event.event_time)}` : '';
    const dateLine = `${dateStr}${timeStr}`;
    const descriptionLine = event.description ? excerpt(event.description, 90) : null;
    // Location feature: the venue line sits between the when and the what,
    // truncated on the same GSM-7 budget as title/description.
    const locationLine = event.location ? `Where: ${excerpt(event.location, 90)}` : null;

    // Body assembly lives in _shared/smsBody.ts (unit-tested directly —
    // reserved 555 numbers never reach Twilio, so no e2e observes a real
    // text). Both variants carry the Who's Coming receipt link while
    // RESPONSE_LINK_BASE_URL is set; unset = no line on either variant,
    // which is also the strip switch if carriers or the A2P campaign hate
    // it.
    const responseLinkBase = Deno.env.get('RESPONSE_LINK_BASE_URL')?.replace(/\/$/, '') ?? null;
    const eventUrl = event.url;

    for (const send of sends) {
      // Many-to-one embed arrives as a single object at runtime; the
      // untyped client types embeds as arrays, hence the double cast.
      const person = send.my_people as unknown as {
        user_id: string | null;
        owner_id: string;
        phone_number: string | null;
      } | null;

      if (!person) continue;

      // Who's Coming receipt link, identical on both SMS variants — the
      // per-send token is the only credential, so answering never requires
      // an account or the app. Null when RESPONSE_LINK_BASE_URL is unset.
      const responseLink =
        responseLinkBase && send.response_token
          ? `${responseLinkBase}/?t=${send.response_token}`
          : null;

      // ── Non-app user: SMS only ──────────────────────────────────────────────
      if (!person.user_id) {
        if (
          !twilioConfigured ||
          !person.phone_number ||
          isReservedTestPhone(person.phone_number)
        ) {
          continue;
        }

        // The SMS is the whole message for non-app recipients — there is no
        // other surface. This variant also carries the signup invite.
        smsSends.push(
          sendAndRecord(
            send.id,
            person.phone_number,
            buildSmsBody({
              eventTitle,
              dateLine,
              locationLine,
              descriptionLine,
              eventUrl,
              sharerName: sharerDisplayName ?? sharerPhone,
              signupInvite: true,
              responseLink,
            }),
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
      // App users get the same Coming? receipt link as non-app recipients
      // (FEATURES.md → Coming Link in Every Share SMS) — the SMS is another
      // way to answer, not a lure into the app. No signup invite; they
      // already have the app. Skipped gracefully if Twilio is not
      // configured.
      if (
        twilioConfigured &&
        person.phone_number &&
        !isReservedTestPhone(person.phone_number) &&
        recipientUser?.notify_sms !== false
      ) {
        smsSends.push(
          sendAndRecord(
            send.id,
            person.phone_number,
            buildSmsBody({
              eventTitle,
              dateLine,
              locationLine,
              descriptionLine,
              eventUrl,
              sharerName: displayName,
              signupInvite: false,
              responseLink,
            }),
          ).catch(console.error),
        );
      }
    }

    // ── Send push notifications ─────────────────────────────────────────────
    await sendExpoPush(db, messages);

    // ── Fire all SMS sends (already non-throwing via .catch) ────────────────
    await Promise.all(smsSends);

    return jsonResponse({ sent: messages.length, sms: smsSends.length });
  } catch (err) {
    console.error('send-notification error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
