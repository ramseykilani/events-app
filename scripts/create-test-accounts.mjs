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
//     test OTP so the OTP-UI tests (auth.spec.ts) and native Maestro flows
//     keep working. The merge is read-then-write: existing test OTPs are
//     never clobbered.
//   E2E_TEST_OTP — the shared test OTP registered for every number. The repo
//     is public, so the value lives only in secrets/.env — never hardcode it.
//   E2E_ACCOUNT_PASSWORD — password to set on every account. If unset, one is
//     generated and printed once; store it in .env, Cursor Secrets, and the
//     GitHub repo secrets.
//
// Cost: zero Twilio sends. Users are created (or re-passworded) through the
// Auth Admin API with phone_confirm, and sms_test_otp is registered first so
// the OTP UI (auth.spec.ts) returns message_id "test-otp" instead of calling
// Twilio. Re-running is safe: test-OTP config is merged, and password setting
// is idempotent.

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
const TEST_OTP = process.env.E2E_TEST_OTP;
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
  E2E_TEST_OTP: TEST_OTP,
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

const CONFIG_PATH = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;

const MGMT_HEADERS = {
  authorization: `Bearer ${ACCESS_TOKEN}`,
  'user-agent': 'Mozilla/5.0 (compatible; events-app-agent/1.0)',
};

async function getAuthConfig() {
  const res = await fetch(CONFIG_PATH, { headers: MGMT_HEADERS });
  if (!res.ok) {
    throw new Error(
      `GET config/auth failed: ${res.status} ${await res.text()}`
    );
  }
  return res.json();
}

async function getServiceRole() {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/api-keys`,
    { headers: MGMT_HEADERS }
  );
  if (!res.ok) {
    throw new Error(
      `GET api-keys failed: ${res.status} ${await res.text()}`
    );
  }
  const keys = await res.json();
  const service = keys.find((k) => k.id === 'service_role' || k.name === 'service_role');
  if (!service?.api_key) {
    throw new Error('no service_role key in Management API api-keys response');
  }
  return service.api_key;
}

function phoneDigits(phone) {
  return phone.replace(/\D/g, '');
}

async function findUserByPhone(service, phone) {
  const want = phoneDigits(phone);
  let page = 1;
  for (;;) {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`,
      {
        headers: { authorization: `Bearer ${service}`, apikey: service },
      }
    );
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      throw new Error(
        `admin list users failed: ${res.status} ${JSON.stringify(json)}`
      );
    }
    const users = json.users ?? [];
    const match = users.find((u) => phoneDigits(u.phone ?? '') === want);
    if (match) return match;
    if (users.length < 200) return null;
    page += 1;
  }
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
  // "15555550100=<code>,15555550103=<code>". Merge in that shape and PATCH it
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
      ...MGMT_HEADERS,
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
    `test OTP registered for ${targets.length} number(s); ` +
      `${merged.size} total in config`
  );
}

// 2. Per account: create or update via the Auth Admin API (phone confirmed,
// password set) — never call /otp, so Twilio is never contacted. Then prove
// the password grant works.
async function provision(phone, service) {
  const existing = await findUserByPhone(service, phone);
  const adminHeaders = {
    authorization: `Bearer ${service}`,
    apikey: service,
    'content-type': 'application/json',
  };
  if (existing) {
    const update = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${existing.id}`,
      {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ password }),
      }
    );
    if (!update.ok) {
      throw new Error(
        `${phone}: admin password update failed: ${update.status} ${await update.text()}`
      );
    }
  } else {
    const create = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        phone,
        phone_confirm: true,
        password,
      }),
    });
    if (!create.ok) {
      throw new Error(
        `${phone}: admin create failed: ${create.status} ${await create.text()}`
      );
    }
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
const service = await getServiceRole();
for (const phone of targets) {
  await provision(phone, service);
}
if (FRESH_PAIR) {
  console.log(
    `\nexport E2E_PHONE_A=${targets[0]}\nexport E2E_PHONE_B=${targets[1]}`
  );
}
console.log('done.');
