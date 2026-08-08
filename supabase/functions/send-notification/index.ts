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
  const iosStoreUrl = Deno.env.get('IOS_APP_STORE_URL');
  const androidStoreUrl = Deno.env.get('ANDROID_PLAY_STORE_URL');
  // Stable URL of the deployed web build. When set, SMS messages link the
  // website (which anyone can open) instead of app-store links / the
  // custom-scheme deep link that SMS clients never linkify.
  const webAppUrl = Deno.env.get('WEB_APP_URL')?.replace(/\/+$/, '') || null;
  const twilioConfigured = !!(
    twilioAccountSid &&
    twilioAuthToken &&
    (twilioMessagingServiceSid || twilioFromNumber)
  );
  const twilioSender = {
    messagingServiceSid: twilioMessagingServiceSid ?? undefined,
    fromNumber: twilioFromNumber ?? undefined,
  };
  // Non-app users are told where to get the app, so at least one destination
  // (the website or a store) is required. App users only need the event URL /
  // event link, so Twilio credentials alone are enough for them.
  const nonAppSmsEnabled = twilioConfigured && !!(webAppUrl || iosStoreUrl || androidStoreUrl);

  const db = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { userEventId } = await req.json();
    if (!userEventId || typeof userEventId !== 'string') {
      return jsonResponse({ error: 'userEventId is required' }, 400);
    }

    // Load the user_event to get the sharer and event
    const { data: userEvent, error: ueErr } = await db
      .from('user_events')
      .select('user_id, event_id, events(title, event_date, event_time, url)')
      .eq('id', userEventId)
      .single();

    if (ueErr || !userEvent) {
      return jsonResponse({ error: 'user_event not found' }, 404);
    }

    if (userEvent.user_id !== caller.id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const sharerUserId = userEvent.user_id;
    const event = userEvent.events as {
      title: string | null;
      event_date: string;
      event_time: string | null;
      url: string | null;
    } | null;

    if (!event) return jsonResponse({ error: 'event not found' }, 404);

    // Fetch the sharer's phone number once — used as display identifier in SMS
    // to non-app users who don't have a contact name for the sharer
    const { data: sharerUser } = await db
      .from('users')
      .select('phone_number')
      .eq('id', sharerUserId)
      .single();
    const sharerPhone = sharerUser?.phone_number ?? 'Someone';

    // Load all shares for this user_event, including each recipient's phone number
    const { data: shares, error: sharesErr } = await db
      .from('event_shares')
      .select('person_id, my_people(user_id, owner_id, phone_number)')
      .eq('user_event_id', userEventId);

    if (sharesErr || !shares?.length) {
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

    const eventTitle = event.title ?? 'an event';
    const dateStr = formatDate(event.event_date);
    const timeStr = event.event_time ? ` · ${formatTime(event.event_time)}` : '';
    const eventId = userEvent.event_id;
    // Recipients should be able to act without opening the app.
    const eventUrlLine = event.url ? `${event.url}\n` : '';

    for (const share of shares) {
      const person = share.my_people as {
        user_id: string | null;
        owner_id: string;
        phone_number: string | null;
      } | null;

      if (!person) continue;

      // ── Non-app user: SMS only ──────────────────────────────────────────────
      if (!person.user_id) {
        if (!nonAppSmsEnabled || !person.phone_number) continue;

        // Prefer the website (anyone can open it) over store links.
        const appLines = webAppUrl
          ? `See it on the web:\n${webAppUrl}`
          : `Get the Events app:\n${[
              iosStoreUrl ? `iOS: ${iosStoreUrl}` : null,
              androidStoreUrl ? `Android: ${androidStoreUrl}` : null,
            ]
              .filter(Boolean)
              .join('\n')}`;

        const smsBody =
          `${sharerPhone} added you to ${eventTitle} on ${dateStr}${timeStr}\n` +
          eventUrlLine +
          `${appLines}\n\n` +
          `Reply STOP to unsubscribe.`;

        smsSends.push(
          sendSms(
            person.phone_number,
            smsBody,
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

      // Get the sharer's display name in the recipient's contacts
      const sharerName = sharerInRecipientContacts
        ? (
            await db
              .from('my_people')
              .select('contact_name, phone_number')
              .eq('id', sharerInRecipientContacts.id)
              .single()
          ).data
        : null;

      const displayName =
        sharerName?.contact_name ?? sharerName?.phone_number ?? 'Someone';

      // Queue push notification when the recipient has a token. A missing token
      // must not suppress the SMS below.
      const { data: recipientUser } = await db
        .from('users')
        .select('expo_push_token')
        .eq('id', recipientUserId)
        .single();

      if (recipientUser?.expo_push_token) {
        messages.push({
          to: recipientUser.expo_push_token,
          title: `${displayName} added you to ${eventTitle}`,
          body: `${dateStr}${timeStr}`,
          data: { eventId },
        });
      }

      // Queue SMS with the event URL and a tappable link to open the event.
      // When the web build is deployed, a single https link opens the event for
      // anyone (and can upgrade to a universal link / App Link later); the
      // custom scheme only works on native installs and isn't linkified by
      // SMS clients. Skipped gracefully if Twilio is not configured.
      if (twilioConfigured && person.phone_number) {
        const eventLink = webAppUrl
          ? `${webAppUrl}/event/${eventId}`
          : `events-app://event/${eventId}`;
        const smsBody =
          `${displayName} added you to ${eventTitle} on ${dateStr}${timeStr}\n` +
          eventUrlLine +
          eventLink;

        smsSends.push(
          sendSms(
            person.phone_number,
            smsBody,
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
