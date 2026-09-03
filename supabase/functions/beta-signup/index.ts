import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildAndroidCompletionBody,
  buildOwnerAlertBody,
  validateBetaSubmission,
  type BetaSubmission,
} from '../_shared/betaSignup.ts';
import { sendSms, type SmsSender } from '../_shared/twilioSms.ts';

// Beta Signup Pipeline (FEATURES.md) — the backend for the signup form at
// events-landing.pages.dev/signup. Deployed --no-verify-jwt (the
// send-response pattern): the form is public, so submit is unauthenticated
// but rate-limited and every signup SMSes the owner (the abuse tripwire —
// no approval gate, owner call 2026-09-03). The Grok Bot's two routes carry
// the shared-secret x-beta-bot-secret header as the only credential; it
// grants exactly two capabilities — list pending Android Gmail adds and
// report one done.
//
// Routes (pathname suffix):
//   POST /beta-signup                  public submit
//   GET  /beta-signup/pending-android  Bot poll: ids + Gmail addresses
//   POST /beta-signup/fulfill-android  Bot webhook: flip added (+completion
//                                      SMS) or failed (error report)
//
// iOS fulfillment is not here — the beta-ios-fulfill cron poller drives the
// App Store Connect API state machine.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // supabase-js always sends apikey and x-client-info alongside
  // Authorization; the Bot's secret header must be allowed too or the
  // browser preflight / Bot call blocks.
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-beta-bot-secret',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Abuse posture (owner call 2026-09-03): no approval gate, so the submit
// endpoint rate-limits. Per-identity: one contact (any of the emails or the
// phone) submits at most 3 times per 24h. Global: 50 signups per 24h — the
// tracks cap at 100 seats, so a scripted flood should stall long before it
// fills them. Both fail with the same generic 429.
const PER_IDENTITY_LIMIT = 3;
const GLOBAL_LIMIT = 50;
const RATE_WINDOW_HOURS = 24;

type Db = ReturnType<typeof createClient>;

async function countRecent(db: Db, column: 'apple_email' | 'play_email' | 'phone', value: string, sinceIso: string): Promise<number> {
  const { count, error } = await db
    .from('beta_signups')
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
    .gte('created_at', sinceIso);
  if (error) throw error;
  return count ?? 0;
}

// A live row for any of the submission's identities means this person
// already signed up — return it as a no-op so a double-submit never
// double-fulfills.
async function findExisting(db: Db, s: BetaSubmission): Promise<boolean> {
  const lookups: PromiseLike<{ data: { id: string } | null; error: unknown }>[] = [];
  if (s.appleEmail) {
    lookups.push(
      db.from('beta_signups').select('id').eq('apple_email', s.appleEmail).limit(1).maybeSingle(),
    );
  }
  if (s.playEmail) {
    lookups.push(
      db.from('beta_signups').select('id').eq('play_email', s.playEmail).limit(1).maybeSingle(),
    );
  }
  if (s.phone) {
    lookups.push(
      db.from('beta_signups').select('id').eq('phone', s.phone).limit(1).maybeSingle(),
    );
  }
  const results = await Promise.all(lookups);
  for (const r of results) {
    if (r.error) throw r.error;
    if (r.data) return true;
  }
  return false;
}

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

  // Twilio config mirrors send-notification: account SID + auth token + a
  // sender (messaging service SID preferred, phone number as fallback).
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioSender: SmsSender = {
    messagingServiceSid: Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') ?? undefined,
    fromNumber: Deno.env.get('TWILIO_PHONE_NUMBER') ?? undefined,
  };
  const twilioConfigured = !!(
    twilioAccountSid &&
    twilioAuthToken &&
    (twilioSender.messagingServiceSid || twilioSender.fromNumber)
  );

  const path = new URL(req.url).pathname.replace(/\/+$/, '');

  try {
    // ── Bot routes (shared-secret) ──────────────────────────────────────
    if (path.endsWith('/pending-android') || path.endsWith('/fulfill-android')) {
      // Fails closed when unset — same posture as cleanup-people's
      // CRON_SECRET.
      const botSecret = Deno.env.get('BETA_BOT_SECRET');
      if (!botSecret) {
        console.error('beta-signup: BETA_BOT_SECRET is not configured');
        return jsonResponse({ error: 'Server misconfigured' }, 500);
      }
      if (req.headers.get('x-beta-bot-secret') !== botSecret) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      if (path.endsWith('/pending-android')) {
        if (req.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
        // The Bot needs only what the Play list add consumes — the Gmail.
        // first_name/phone stay server-side (the completion SMS reads them
        // from the row at fulfill time).
        const { data, error } = await db
          .from('beta_signups')
          .select('id, play_email, created_at')
          .eq('android_status', 'pending')
          .order('created_at', { ascending: true })
          .limit(100);
        if (error) {
          console.error('beta-signup: pending-android read failed', error);
          return jsonResponse({ error: error.message }, 500);
        }
        return jsonResponse({ pending: data ?? [] });
      }

      // fulfill-android
      if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
      const body = await req.json().catch(() => null);
      const id = body?.id;
      const botError = typeof body?.error === 'string' ? body.error.slice(0, 500) : null;
      if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
        return jsonResponse({ error: 'id must be a signup uuid' }, 400);
      }

      const { data: row, error: readErr } = await db
        .from('beta_signups')
        .select('id, first_name, phone, android_status')
        .eq('id', id)
        .maybeSingle();
      if (readErr) {
        console.error('beta-signup: fulfill read failed', readErr);
        return jsonResponse({ error: readErr.message }, 500);
      }
      if (!row || !row.android_status) {
        return jsonResponse({ error: 'Unknown signup' }, 404);
      }

      // The Bot reports Play rejected the Gmail → terminal, owner reads it
      // in the table.
      if (botError) {
        if (row.android_status === 'pending') {
          await db
            .from('beta_signups')
            .update({ android_status: 'failed', android_error: botError })
            .eq('id', id);
        }
        return jsonResponse({ status: 'failed' });
      }

      // Idempotent: a retried webhook never re-sends the completion SMS.
      if (row.android_status === 'added') {
        return jsonResponse({ status: 'already' });
      }

      const { error: updateErr } = await db
        .from('beta_signups')
        .update({ android_status: 'added', android_error: null })
        .eq('id', id)
        .eq('android_status', 'pending');
      if (updateErr) {
        console.error('beta-signup: fulfill update failed', updateErr);
        return jsonResponse({ error: updateErr.message }, 500);
      }

      // The list add already happened in the real world, so the row stays
      // 'added' even if the completion text fails — the failure lands in
      // android_error for the owner to see.
      const optInUrl = Deno.env.get('BETA_PLAY_OPTIN_URL');
      if (!optInUrl) {
        console.error('beta-signup: BETA_PLAY_OPTIN_URL is not configured');
        await db
          .from('beta_signups')
          .update({ android_error: 'completion SMS not sent: BETA_PLAY_OPTIN_URL unset' })
          .eq('id', id);
        return jsonResponse({ status: 'added', sms: 'skipped' });
      }
      if (!twilioConfigured) {
        console.error('beta-signup: Twilio is not configured');
        await db
          .from('beta_signups')
          .update({ android_error: 'completion SMS not sent: Twilio unconfigured' })
          .eq('id', id);
        return jsonResponse({ status: 'added', sms: 'skipped' });
      }
      const sms = await sendSms(
        row.phone,
        buildAndroidCompletionBody({ firstName: row.first_name, optInUrl }),
        twilioAccountSid!,
        twilioAuthToken!,
        twilioSender,
      );
      if (sms.status === 'rejected') {
        await db
          .from('beta_signups')
          .update({
            android_error: `completion SMS rejected: ${sms.errorCode ?? ''} ${sms.errorMessage ?? ''}`.trim(),
          })
          .eq('id', id);
      }
      return jsonResponse({ status: 'added', sms: sms.status });
    }

    // ── Public submit ───────────────────────────────────────────────────
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const raw = await req.json().catch(() => null);
    const validation = validateBetaSubmission(raw);
    if (!validation.ok) {
      return jsonResponse({ error: validation.error }, 400);
    }
    const submission = validation.submission;

    if (await findExisting(db, submission)) {
      return jsonResponse({ status: 'existing' });
    }

    const sinceIso = new Date(Date.now() - RATE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const identityCounts = await Promise.all([
      submission.appleEmail ? countRecent(db, 'apple_email', submission.appleEmail, sinceIso) : 0,
      submission.playEmail ? countRecent(db, 'play_email', submission.playEmail, sinceIso) : 0,
      submission.phone ? countRecent(db, 'phone', submission.phone, sinceIso) : 0,
    ]);
    if (identityCounts.some((c) => c >= PER_IDENTITY_LIMIT)) {
      return jsonResponse({ error: 'Too many signups - try again tomorrow.' }, 429);
    }
    const { count: globalCount, error: globalErr } = await db
      .from('beta_signups')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sinceIso);
    if (globalErr) throw globalErr;
    if ((globalCount ?? 0) >= GLOBAL_LIMIT) {
      return jsonResponse({ error: 'Signups are paused right now - try again tomorrow.' }, 429);
    }

    const { data: inserted, error: insertErr } = await db
      .from('beta_signups')
      .insert({
        first_name: submission.firstName,
        last_name: submission.lastName,
        platform: submission.platform,
        apple_email: submission.appleEmail,
        play_email: submission.playEmail,
        phone: submission.phone,
        ios_status: submission.appleEmail ? 'pending' : null,
        android_status: submission.playEmail ? 'pending' : null,
      })
      .select('id')
      .single();
    if (insertErr) {
      console.error('beta-signup: insert failed', insertErr);
      return jsonResponse({ error: insertErr.message }, 500);
    }

    // One SMS to the owner per signup — the no-gate tripwire. Best-effort:
    // the signup itself is already committed.
    const ownerPhone = Deno.env.get('BETA_OWNER_PHONE');
    if (ownerPhone && twilioConfigured) {
      const alert = await sendSms(
        ownerPhone,
        buildOwnerAlertBody(submission),
        twilioAccountSid!,
        twilioAuthToken!,
        twilioSender,
      );
      if (alert.status === 'rejected') {
        console.error('beta-signup: owner alert rejected', alert.errorCode, alert.errorMessage);
      }
    } else if (!ownerPhone) {
      console.error('beta-signup: BETA_OWNER_PHONE is not configured');
    }

    return jsonResponse({ status: 'ok', id: inserted.id });
  } catch (err) {
    console.error('beta-signup error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
