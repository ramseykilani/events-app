#!/usr/bin/env node
// Provisions the e2e test-account pool on the Supabase project so the
// Playwright suite can sign in with phone + password — password sign-in fires
// no SMS, which ends the Twilio messaging-health churn from rejected sends at
// the fictional 555 numbers (~770 rejected sends in 30 days before
// 2026-08-17, when sign-ins were still per-test).
//
// Usage:
//   node scripts/create-test-accounts.mjs [+15555550114 ...]
//   node scripts/create-test-accounts.mjs --fresh-pair
//
// With no arguments it provisions the default pool: standing accounts A/B
// (password only — they already exist) plus pool accounts C–F. With
// arguments it provisions exactly those numbers (for growing the pool or
// creating a throwaway account, e.g. M-003's fresh onboarding account).
// With --fresh-pair it picks two random unregistered numbers from the
// fictional 555-01xx block, provisions them, and prints the E2E_PHONE_A/B
// exports — how a parallel agent self-serves its own account pair without
// the dispatcher assigning one.
//
// Required env (.env is loaded automatically, without overriding real env):
//   EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
//   SUPABASE_ACCESS_TOKEN — Management API token; registers each number's
//     test OTP (123456) so the OTP-UI tests (auth.spec.ts) and native Maestro
//     flows keep working. The merge is read-then-write: existing test OTPs
//     are never clobbered.
//   E2E_ACCOUNT_PASSWORD — password to set on every account. If unset, one is
//     generated and printed once; store it in .env, Cursor Secrets, and the
//     GitHub repo secrets.
//
// Cost: each account's first OTP request fires ONE Twilio send attempt
// (rejected 21211 at the 555 numbers — free, one-time). Once the password is
// set, no harness sign-in fires SMS again. Re-running is safe: test-OTP
// config is merged, and password setting is idempotent.

import { existsSync, readFileSync } from 'node:fs';
import { randomBytes, randomInt } from 'node:crypto';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const TEST_OTP = '123456';
const TEST_OTP_VALID_UNTIL = '2027-03-31T00:00:00Z'; // matches A/B

const DEFAULT_POOL = [
  '+15555550100', // A (standing)
  '+15555550103', // B (standing)
  '+15555550110', // C ─┐ pool: one pair per parallel agent, assigned via
  '+15555550111', // D  │ E2E_PHONE_A / E2E_PHONE_B env overrides
  '+15555550112', // E  │
  '+15555550113', // F ─┘
];

const FRESH_PAIR = process.argv.includes('--fresh-pair');
const phones = process.argv.slice(2).filter((a) => a !== '--fresh-pair');
if (FRESH_PAIR && phones.length > 0) {
  console.error('--fresh-pair picks the numbers itself; pass it alone');
  process.exit(1);
}
let targets = phones.length > 0 ? phones : DEFAULT_POOL;

for (const [name, value] of Object.entries({
  EXPO_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_ACCESS_TOKEN: ACCESS_TOKEN,
})) {
  if (!value) {
    console.error(`missing ${name} — set it in the environment or .env`);
    process.exit(1);
  }
}

let password = process.env.E2E_ACCOUNT_PASSWORD;
if (!password) {
  password = randomBytes(16).toString('hex');
  console.log(
    `generated E2E_ACCOUNT_PASSWORD=${password}\n` +
      'store it in .env, Cursor Secrets, and GitHub repo secrets, then re-run with it set.\n'
  );
}

const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      'content-type': 'application/json',
      apikey: ANON_KEY,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CONFIG_PATH = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;

async function getAuthConfig() {
  const res = await fetch(CONFIG_PATH, {
    headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(
      `GET config/auth failed: ${res.status} ${await res.text()}`
    );
  }
  return res.json();
}

// Picks two random numbers from the fictional 555-01xx block that no test
// OTP is registered for yet. The reserved fictional range tops out at
// 555-0199, and 0100–0113 are the standing/pool accounts — fresh pairs come
// from 0114–0199.
async function pickFreshPair() {
  const config = await getAuthConfig();
  const registered = new Set(
    String(config.sms_test_otp ?? '')
      .split(',')
      .filter(Boolean)
      .map((pair) => pair.split('=')[0])
  );
  const free = [];
  for (let n = 14; n <= 99; n += 1) {
    const phone = `+155555501${String(n).padStart(2, '0')}`;
    if (!registered.has(phone.replace(/^\+/, ''))) free.push(phone);
  }
  if (free.length < 2) {
    throw new Error(
      'fresh-pair block exhausted (555-0114–0199 all registered) — reuse an ' +
        'existing pair or retire dead accounts from sms_test_otp'
    );
  }
  const first = free.splice(randomInt(free.length), 1)[0];
  const second = free.splice(randomInt(free.length), 1)[0];
  return [first, second];
}

// 1. Merge the targets into the project's test-OTP config (read-then-write —
// a wholesale PATCH of sms_test_otp would clobber the standing accounts).
async function ensureTestOtps() {
  const config = await getAuthConfig();
  // The Management API serializes sms_test_otp as one comma-separated string
  // of `phone=code` pairs, phones WITHOUT the leading '+':
  // "15555550100=123456,15555550103=123456". Merge in that shape and PATCH it
  // back unchanged in kind — a wholesale replace would clobber the standing
  // accounts.
  const raw = config.sms_test_otp ?? '';
  if (typeof raw !== 'string') {
    throw new Error(
      `sms_test_otp has an unexpected shape — refusing to overwrite: ${JSON.stringify(raw)}`
    );
  }
  const merged = new Map();
  for (const pair of raw.split(',')) {
    if (!pair) continue;
    const [phone, code] = pair.split('=');
    if (!phone || !code) {
      throw new Error(`unparseable sms_test_otp entry: ${pair}`);
    }
    merged.set(phone, code);
  }
  for (const phone of targets) merged.set(phone.replace(/^\+/, ''), TEST_OTP);
  const serialized = [...merged.entries()]
    .map(([phone, code]) => `${phone}=${code}`)
    .join(',');
  const patch = await fetch(CONFIG_PATH, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${ACCESS_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sms_test_otp: serialized,
      sms_test_otp_valid_until:
        config.sms_test_otp_valid_until ?? TEST_OTP_VALID_UNTIL,
    }),
  });
  if (!patch.ok) {
    throw new Error(
      `PATCH config/auth failed: ${patch.status} ${await patch.text()}`
    );
  }
  console.log(
    `test OTP (${TEST_OTP}) registered for ${targets.length} number(s); ` +
      `${merged.size} total in config`
  );
}

// 2. Per account: OTP sign-in (creates the user on first use; the SMS send
// itself is rejected by Twilio at the 555 number — expected), set the
// password, then prove the password grant works.
async function provision(phone) {
  let otp = await api(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    body: { phone },
  });
  // Two transient failures, both observed in practice:
  // - 429: one OTP request per number per 60s — a re-run inside the window
  //   waits it out.
  // - 422 sms_send_failed on a brand-new number: the test-OTP config PATCH
  //   can take a moment to reach the auth service, and until it does the
  //   number gets a real Twilio send attempt (rejected 21211) that fails the
  //   request. Retry while propagation catches up.
  for (let attempt = 0; attempt < 3 && !otp.ok; attempt += 1) {
    const retryable =
      otp.status === 429 || otp.json?.error_code === 'sms_send_failed';
    if (!retryable) break;
    const wait = otp.status === 429 ? 65_000 : 30_000;
    console.log(
      `${phone}: OTP send ${otp.status === 429 ? 'rate-limited' : 'config still propagating'}; retrying in ${wait / 1000}s`
    );
    await sleep(wait);
    otp = await api(`${SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      body: { phone },
    });
  }
  if (!otp.ok) {
    throw new Error(`${phone}: OTP send failed: ${JSON.stringify(otp.json)}`);
  }

  const verify = await api(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    body: { type: 'sms', phone, token: TEST_OTP },
  });
  if (!verify.ok || !verify.json.access_token) {
    throw new Error(
      `${phone}: OTP verify failed: ${JSON.stringify(verify.json)}`
    );
  }

  const update = await api(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    token: verify.json.access_token,
    body: { password },
  });
  if (!update.ok) {
    throw new Error(
      `${phone}: setting password failed: ${JSON.stringify(update.json)}`
    );
  }

  const grant = await api(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    { method: 'POST', body: { phone, password } }
  );
  if (!grant.ok || !grant.json.access_token) {
    throw new Error(
      `${phone}: password grant failed after set: ${JSON.stringify(grant.json)}`
    );
  }
  console.log(`${phone}: provisioned — password sign-in verified`);
}

if (FRESH_PAIR) {
  targets = await pickFreshPair();
  console.log(`fresh pair: ${targets[0]} / ${targets[1]}`);
}
await ensureTestOtps();
for (const phone of targets) {
  await provision(phone);
  // Stay under the 1-OTP/60s/number limit without serializing the whole pool
  // on the full cooldown — the limit is per number, so only a re-run of the
  // SAME number hits it. No sleep needed between distinct numbers.
}
if (FRESH_PAIR) {
  console.log(
    `\nexport E2E_PHONE_A=${targets[0]}\nexport E2E_PHONE_B=${targets[1]}`
  );
}
console.log('done.');
