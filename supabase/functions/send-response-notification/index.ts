import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { notifyAskerOfResponse } from '../_shared/responseNotify.ts';

// Who's Coming: push the asker when a recipient's yes/no answer CHANGES
// (first answer and flips — opening the event and leaving it never pings).
// The client invokes this fire-and-forget after respond_to_send reports a
// change; this function re-verifies the whole chain rather than trusting
// the call:
//   - the caller owns the events row they name (their received copy);
//   - that copy came from someone (from_event_id / from_user_id);
//   - a send exists from that sender to the caller;
//   - the send's answer exists and was written moments ago (responded_at
//     freshness), so a replayed or late-arriving invoke cannot re-ping.
// Person-triggered, same family as the share notification, opposite
// direction. Push only — never an SMS to the asker per answer.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// The client invokes immediately after respond_to_send commits; anything
// older is a replay or a stalled retry and must not notify.
const FRESH_WINDOW_MS = 2 * 60 * 1000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
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

  const db = createClient(supabaseUrl, serviceRoleKey);

  try {
    // eventId is the RECIPIENT'S own row id (the copy they answered on).
    const { eventId } = await req.json();
    if (!eventId || typeof eventId !== 'string') {
      return jsonResponse({ error: 'eventId is required' }, 400);
    }

    const { data: row, error: rowErr } = await db
      .from('events')
      .select('id, owner_id, from_event_id, from_user_id')
      .eq('id', eventId)
      .maybeSingle();
    if (rowErr || !row) {
      return jsonResponse({ error: 'event not found' }, 404);
    }
    if (row.owner_id !== caller.id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }
    if (!row.from_event_id || !row.from_user_id) {
      return jsonResponse({ error: 'Nothing to answer — caller created this event' }, 400);
    }

    // The send line: the sender's row + the sender's contact entry for the
    // caller (at most one — my_people is UNIQUE(owner_id, phone_number)).
    const { data: person } = await db
      .from('my_people')
      .select('id')
      .eq('owner_id', row.from_user_id)
      .eq('user_id', caller.id)
      .maybeSingle();
    if (!person) {
      return jsonResponse({ error: 'No share to answer' }, 404);
    }
    const { data: send } = await db
      .from('sends')
      .select('id, response, responded_at')
      .eq('event_id', row.from_event_id)
      .eq('person_id', person.id)
      .maybeSingle();
    if (!send || !send.response) {
      return jsonResponse({ error: 'No answer recorded' }, 404);
    }

    const answeredAt = send.responded_at ? Date.parse(send.responded_at) : 0;
    if (Date.now() - answeredAt > FRESH_WINDOW_MS) {
      return jsonResponse({ sent: 0, stale: true });
    }

    const result = await notifyAskerOfResponse(db, send.id);
    return jsonResponse({ sent: result === 'sent' ? 1 : 0 });
  } catch (err) {
    console.error('send-response-notification error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
