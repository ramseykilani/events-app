import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Beta Signup Pipeline (FEATURES.md) — the iOS fulfillment poller. pg_cron
// runs it every minute (the cleanup-people pattern: verify-jwt stays on at
// the gateway, the job sends the apikey + x-cron-secret headers, and the
// function fails closed when CRON_SECRET is unset).
//
// It advances beta_signups.ios_status through the App Store Connect API —
// the whole iOS flow is API-driven, no browser agent:
//   pending  → POST /v1/userInvitations (MARKETING, visibleApps = Shared
//              Events only) → invited. Apple emails the tester the account
//              invite.
//   invited  → GET /v1/users?filter[email]=… — the user row appears once
//              the tester accepts (the one human-paced step) → accepted.
//   accepted → POST /v1/betaGroups/{id}/relationships/betaTesters (the
//              "Team (Expo)" internal group) → added. Apple emails the
//              TestFlight invite. No completion message from us — Apple's
//              two emails do the work.
//
// Errors: a 4xx from ASC (other than the already-done 409/422 self-heals)
// is terminal for the row ('failed' + ios_error — e.g. a bad email will
// never succeed); 5xx and network errors hold the status and retry next
// cycle.

const ASC_APP_ID = '6801756936'; // Shared Events (eas.json submit.production.ios.ascAppId)
const ASC_BETA_GROUP_NAME = 'Team (Expo)'; // STATUS.md → Testers
const ASC_BASE = 'https://api.appstoreconnect.apple.com/v1';
const BATCH_LIMIT = 25; // bounded so a surprise backlog fits the wall-clock budget

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── ASC API auth: ES256 JWT minted from the Admin Team Key (.p8) ─────────
// The same key EAS submit uses (EXPO_ASC_* in Cursor/GitHub secrets), set
// here as ASC_* function secrets. userInvitations requires an Admin key.

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function ascJwt(): Promise<string> {
  const keyId = Deno.env.get('ASC_KEY_ID');
  const issuerId = Deno.env.get('ASC_ISSUER_ID');
  const p8Base64 = Deno.env.get('ASC_PRIVATE_KEY_P8');
  if (!keyId || !issuerId || !p8Base64) {
    throw new Error('ASC_KEY_ID / ASC_ISSUER_ID / ASC_PRIVATE_KEY_P8 must all be set');
  }
  // The secret is the base64 of the .p8 PEM file; importKey needs the DER
  // inside it.
  const pem = atob(p8Base64);
  const derBase64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, '');
  const der = Uint8Array.from(atob(derBase64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })))}.${base64UrlEncode(new TextEncoder().encode(JSON.stringify({ iss: issuerId, iat: now, exp: now + 20 * 60, aud: 'appstoreconnect-v1' })))}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;
}

interface AscResponse {
  status: number;
  body: { data?: unknown; errors?: { detail?: string }[] } | null;
}

async function ascFetch(
  method: string,
  path: string,
  token: string,
  payload?: unknown,
): Promise<AscResponse> {
  const res = await fetch(`${ASC_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function ascErrorDetail(body: AscResponse['body']): string {
  return body?.errors?.map((e) => e.detail ?? '').join('; ') || 'unknown ASC error';
}

type Db = ReturnType<typeof createClient>;

async function setIosState(
  db: Db,
  id: string,
  status: 'invited' | 'accepted' | 'added' | 'failed',
  error: string | null,
): Promise<void> {
  const { error: updateErr } = await db
    .from('beta_signups')
    .update({ ios_status: status, ios_error: error })
    .eq('id', id);
  if (updateErr) console.error('beta-ios-fulfill: state write failed', id, updateErr);
}

async function holdWithError(db: Db, id: string, message: string): Promise<void> {
  const { error: updateErr } = await db
    .from('beta_signups')
    .update({ ios_error: message.slice(0, 500) })
    .eq('id', id);
  if (updateErr) console.error('beta-ios-fulfill: error write failed', id, updateErr);
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    console.error('beta-ios-fulfill: CRON_SECRET is not configured');
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }
  if (req.headers.get('x-cron-secret') !== cronSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const summary = { invited: 0, accepted: 0, added: 0, failed: 0, held: 0 };

  try {
    const token = await ascJwt();

    // ── pending → invited ───────────────────────────────────────────────
    const { data: pendingRows, error: pendingErr } = await db
      .from('beta_signups')
      .select('id, first_name, last_name, apple_email')
      .eq('ios_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT);
    if (pendingErr) throw pendingErr;

    for (const row of pendingRows ?? []) {
      const res = await ascFetch('POST', '/userInvitations', token, {
        data: {
          type: 'userInvitations',
          attributes: {
            email: row.apple_email,
            firstName: row.first_name,
            lastName: row.last_name,
            roles: ['MARKETING'],
          },
          relationships: {
            visibleApps: { data: [{ type: 'apps', id: ASC_APP_ID }] },
          },
        },
      });
      if (res.status === 201 || res.status === 200 || res.status === 409) {
        // 409 = an invitation for this email already exists (e.g. a retried
        // run after a lost state write) — the desired end state either way.
        await setIosState(db, row.id, 'invited', null);
        summary.invited++;
      } else if (res.status >= 400 && res.status < 500) {
        await setIosState(db, row.id, 'failed', `userInvitations ${res.status}: ${ascErrorDetail(res.body)}`);
        summary.failed++;
      } else {
        await holdWithError(db, row.id, `userInvitations ${res.status}: ${ascErrorDetail(res.body)}`);
        summary.held++;
      }
    }

    // ── invited → accepted (the tester accepted Apple's account invite) ──
    const { data: invitedRows, error: invitedErr } = await db
      .from('beta_signups')
      .select('id, apple_email')
      .eq('ios_status', 'invited')
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT);
    if (invitedErr) throw invitedErr;

    for (const row of invitedRows ?? []) {
      const res = await ascFetch(
        'GET',
        `/users?filter[email]=${encodeURIComponent(row.apple_email)}`,
        token,
      );
      if (res.status !== 200) {
        await holdWithError(db, row.id, `users lookup ${res.status}: ${ascErrorDetail(res.body)}`);
        summary.held++;
        continue;
      }
      const users = (res.body?.data ?? []) as { id: string }[];
      if (users.length === 0) continue; // not accepted yet — check again next cycle
      await setIosState(db, row.id, 'accepted', null);
      summary.accepted++;
    }

    // ── accepted → added (into the Team (Expo) beta group) ──────────────
    const { data: acceptedRows, error: acceptedErr } = await db
      .from('beta_signups')
      .select('id, apple_email')
      .eq('ios_status', 'accepted')
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT);
    if (acceptedErr) throw acceptedErr;

    if ((acceptedRows ?? []).length > 0) {
      // Resolve the group id by name each run — self-healing if the group
      // is ever recreated, and cheap at this volume.
      const groupsRes = await ascFetch('GET', `/apps/${ASC_APP_ID}/betaGroups`, token);
      if (groupsRes.status !== 200) {
        console.error('beta-ios-fulfill: betaGroups lookup failed', groupsRes.status);
        summary.held += acceptedRows.length;
        return jsonResponse(summary);
      }
      const groups = (groupsRes.body?.data ?? []) as {
        id: string;
        attributes?: { name?: string };
      }[];
      const group = groups.find((g) => g.attributes?.name === ASC_BETA_GROUP_NAME);
      if (!group) {
        console.error(`beta-ios-fulfill: beta group "${ASC_BETA_GROUP_NAME}" not found`);
        summary.held += acceptedRows.length;
        return jsonResponse(summary);
      }

      for (const row of acceptedRows) {
        const usersRes = await ascFetch(
          'GET',
          `/users?filter[email]=${encodeURIComponent(row.apple_email)}`,
          token,
        );
        const users = usersRes.status === 200 ? ((usersRes.body?.data ?? []) as { id: string }[]) : [];
        if (users.length === 0) {
          // The user row vanished between acceptance and now — hold, retry.
          await holdWithError(db, row.id, 'accepted but no ASC user row found');
          summary.held++;
          continue;
        }
        const addRes = await ascFetch(
          'POST',
          `/betaGroups/${group.id}/relationships/betaTesters`,
          token,
          { data: users.map((u) => ({ type: 'betaTesters', id: u.id })) },
        );
        // 204 = added; 409/422 = already in the group (self-heal).
        if (addRes.status === 204 || addRes.status === 409 || addRes.status === 422) {
          await setIosState(db, row.id, 'added', null);
          summary.added++;
        } else if (addRes.status >= 400 && addRes.status < 500) {
          await setIosState(db, row.id, 'failed', `betaTesters add ${addRes.status}: ${ascErrorDetail(addRes.body)}`);
          summary.failed++;
        } else {
          await holdWithError(db, row.id, `betaTesters add ${addRes.status}: ${ascErrorDetail(addRes.body)}`);
          summary.held++;
        }
      }
    }

    return jsonResponse(summary);
  } catch (err) {
    console.error('beta-ios-fulfill error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
