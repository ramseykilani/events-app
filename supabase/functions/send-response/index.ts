import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { notifyAskerOfResponse } from '../_shared/responseNotify.ts';

// Who's Coming receipt API — the backend for the tiny confirm page linked
// from the share SMS (one capability URL per send; both SMS variants carry
// the link since 2026-08-31, so app users may answer here too — FEATURES.md
// → Coming Link in Every Share SMS). Deployed
// --no-verify-jwt: the link works without a session, so the per-send
// response_token is the credential (122-bit uuid, unguessable; it grants
// exactly one capability — read this send's question and set its answer).
//
// GET is INERT: it returns the page's state and never writes, so SMS /
// iMessage link prefetch cannot record an answer. The write happens only on
// an explicit Yes/No tap (POST). Last write wins — the same link flips the
// answer later, and it keeps working across re-shares because share_event
// never rewrites an existing sends row.
//
// The page shows who asked and the event (title, date, full description,
// listing url — the last two feed its Add to Other Calendars links, which
// are event content, not promo) — nothing else: no other people, no
// comments, no install CTA. The write already happened; the receipt stops
// there. Returning the full description is no privacy expansion: the share
// SMS already discloses a 90-char excerpt and the full listing URL to this
// same token holder (_shared/smsBody.ts).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// Tokens are uuid v4. Reject malformed ones before PostgREST does — an
// invalid-uuid cast error would surface as a 500; the honest answer for any
// token that isn't a live send is the same 404 (no oracle for which shapes
// are valid).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }
  const db = createClient(supabaseUrl, serviceRoleKey);

  try {
    if (req.method === 'GET') {
      const token = new URL(req.url).searchParams.get('t');
      if (!token || !UUID_RE.test(token)) {
        return jsonResponse({ error: 'Unknown or expired link' }, token ? 404 : 400);
      }
      const { data: send, error } = await db
        .from('sends')
        .select('id, response, events(title, event_date, event_time, description, url, owner_id)')
        .eq('response_token', token)
        .maybeSingle();
      if (error) {
        console.error('send-response: lookup failed', error);
        return jsonResponse({ error: error.message }, 500);
      }
      if (!send) {
        return jsonResponse({ error: 'Unknown or expired link' }, 404);
      }
      // Many-to-one embed arrives as a single object at runtime; the
      // untyped client types embeds as arrays, hence the double cast.
      const event = send.events as unknown as {
        title: string | null;
        event_date: string;
        event_time: string | null;
        description: string | null;
        url: string | null;
        owner_id: string;
      } | null;
      if (!event) {
        return jsonResponse({ error: 'Unknown or expired link' }, 404);
      }
      const { data: asker } = await db
        .from('users')
        .select('display_name, phone_number')
        .eq('id', event.owner_id)
        .maybeSingle();
      return jsonResponse({
        askerName: asker?.display_name ?? asker?.phone_number ?? 'Someone',
        title: event.title,
        date: event.event_date,
        time: event.event_time,
        description: event.description,
        url: event.url,
        response: send.response,
      });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null);
      const token = body?.t;
      const response = body?.response;
      if (!token || typeof token !== 'string' || !UUID_RE.test(token)) {
        return jsonResponse({ error: 'Unknown or expired link' }, 404);
      }
      if (response !== 'yes' && response !== 'no') {
        return jsonResponse({ error: 'response must be yes or no' }, 400);
      }

      const { data: send, error } = await db
        .from('sends')
        .select('id, response')
        .eq('response_token', token)
        .maybeSingle();
      if (error) {
        console.error('send-response: lookup failed', error);
        return jsonResponse({ error: error.message }, 500);
      }
      if (!send) {
        return jsonResponse({ error: 'Unknown or expired link' }, 404);
      }

      // Re-choosing the current answer changes nothing and never pings the
      // asker.
      if (send.response === response) {
        return jsonResponse({ response, changed: false });
      }

      const { error: updateErr } = await db
        .from('sends')
        .update({ response, responded_at: new Date().toISOString() })
        .eq('id', send.id);
      if (updateErr) {
        console.error('send-response: update failed', updateErr);
        return jsonResponse({ error: updateErr.message }, 500);
      }

      // The answer changed → the asker gets a push (best-effort; the write
      // is already committed and the page must not fail on a push error).
      // The outcome stays server-side: telling the token holder whether the
      // asker was notified would leak the asker's push/hide state.
      await notifyAskerOfResponse(db, send.id).catch((err) => {
        console.error('send-response: asker push failed', err);
      });

      return jsonResponse({ response, changed: true });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('send-response error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
