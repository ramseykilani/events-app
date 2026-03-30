import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  const db = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { userEventId } = await req.json();
    if (!userEventId || typeof userEventId !== 'string') {
      return jsonResponse({ error: 'userEventId is required' }, 400);
    }

    // Load the user_event to get the sharer and event
    const { data: userEvent, error: ueErr } = await db
      .from('user_events')
      .select('user_id, event_id, events(title, event_date, event_time)')
      .eq('id', userEventId)
      .single();

    if (ueErr || !userEvent) {
      return jsonResponse({ error: 'user_event not found' }, 404);
    }

    const sharerUserId = userEvent.user_id;
    const event = userEvent.events as {
      title: string | null;
      event_date: string;
      event_time: string | null;
    } | null;

    if (!event) return jsonResponse({ error: 'event not found' }, 404);

    // Load all shares for this user_event
    const { data: shares, error: sharesErr } = await db
      .from('event_shares')
      .select('person_id, my_people(user_id, owner_id)')
      .eq('user_event_id', userEventId);

    if (sharesErr || !shares?.length) {
      return jsonResponse({ sent: 0 });
    }

    interface PushMessage {
      to: string;
      title: string;
      body: string;
      data: { eventId: string };
    }

    const messages: PushMessage[] = [];

    for (const share of shares) {
      const person = share.my_people as {
        user_id: string | null;
        owner_id: string;
      } | null;

      // Skip if the recipient isn't an app user (no user_id means no account)
      if (!person?.user_id) continue;

      const recipientUserId = person.user_id;
      const recipientOwnerId = person.owner_id;

      // Get recipient's push token
      const { data: recipientUser } = await db
        .from('users')
        .select('expo_push_token')
        .eq('id', recipientUserId)
        .single();

      if (!recipientUser?.expo_push_token) continue;

      // Check if the sharer is hidden by the recipient: find the sharer in the
      // recipient's my_people, then check hidden_people
      const { data: sharerInRecipientContacts } = await db
        .from('my_people')
        .select('id')
        .eq('owner_id', recipientOwnerId)
        .eq('user_id', sharerUserId)
        .maybeSingle();

      if (sharerInRecipientContacts) {
        const { data: hidden } = await db
          .from('hidden_people')
          .select('id')
          .eq('owner_id', recipientOwnerId)
          .eq('person_id', sharerInRecipientContacts.id)
          .maybeSingle();

        if (hidden) continue; // sharer is hidden — skip notification
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
      const eventTitle = event.title ?? 'an event';
      const dateStr = formatDate(event.event_date);
      const timeStr = event.event_time ? ` · ${formatTime(event.event_time)}` : '';

      messages.push({
        to: recipientUser.expo_push_token,
        title: `${displayName} added you to ${eventTitle}`,
        body: `${dateStr}${timeStr}`,
        data: { eventId: userEvent.event_id },
      });
    }

    if (messages.length === 0) {
      return jsonResponse({ sent: 0 });
    }

    // Send to Expo Push API
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

    return jsonResponse({ sent: messages.length });
  } catch (err) {
    console.error('send-notification error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
