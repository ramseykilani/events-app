#!/usr/bin/env node
// Live round-trip verification of the Who's Coming receipt API
// (send-response edge function) against the real project — the public,
// non-JWT capability endpoint has no unit harness, so this script is the
// repeatable pin for its security properties (E-116 in
// manual-tests/cloud_manual_regression.md exercises the same flow by hand):
//
//   - GET returns only the one send's question (asker name, title, date,
//     current answer) and never writes (prefetch safety)
//   - POST writes yes/no on explicit call, no-ops on the same answer,
//     flips on change
//   - invalid answers are rejected, unknown/malformed tokens 404
//   - the asker reads the answer through RLS (the "Shared with" path)
//
// Usage: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY /
// E2E_ACCOUNT_PASSWORD in the environment (or .env), then:
//   node scripts/verify-receipt-api.mjs
// Signs in as test account A, creates + shares an event to a pending 555
// contact (no real SMS fires), exercises the API, and cleans up after itself.

import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.E2E_ACCOUNT_PASSWORD;
if (!url || !key || !password) {
  throw new Error('needs EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, E2E_ACCOUNT_PASSWORD');
}

const authRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', apikey: key },
  body: JSON.stringify({ phone: process.env.E2E_PHONE_A ?? '+15555550100', password }),
});
if (!authRes.ok) throw new Error(`auth failed: ${authRes.status} ${await authRes.text()}`);
const session = await authRes.json();
const jwt = session.access_token;
const uid = session.user.id;
console.log('signed in as account A:', uid);

const headers = {
  'content-type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${jwt}`,
};

async function rpc(name, body) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const eventId = crypto.randomUUID();
let personId = null;
let failures = 0;
function check(label, cond) {
  console.log(cond ? `PASS ${label}` : `FAIL ${label}`);
  if (!cond) failures++;
}

try {
  await rpc('save_event', {
    p_id: eventId,
    p_url: 'https://example.com/receipt-verify',
    p_title: 'Receipt API verification',
    p_description: 'Receipt API verification details.',
    p_image_url: null,
    p_event_date: '2026-09-05',
    p_event_time: '19:00',
  });

  const personRes = await fetch(`${url}/rest/v1/my_people`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      owner_id: uid,
      phone_number: '+15555550499',
      contact_name: 'Receipt Test Pending',
    }),
  });
  if (!personRes.ok) throw new Error(`person insert failed: ${personRes.status} ${await personRes.text()}`);
  personId = (await personRes.json())[0].id;

  await rpc('share_event', { p_event_id: eventId, p_person_ids: [personId] });

  const sends = await (
    await fetch(
      `${url}/rest/v1/sends?event_id=eq.${eventId}&person_id=eq.${personId}&select=id,response,response_token`,
      { headers }
    )
  ).json();
  if (!sends.length) throw new Error('no sends row');
  const send = sends[0];

  const API = `${url}/functions/v1/send-response`;

  // GET returns the question and nothing beyond it.
  const g1 = await (await fetch(`${API}?t=${send.response_token}`)).json();
  check('GET returns asker/title/date with null answer',
    g1.askerName && g1.title === 'Receipt API verification' && g1.date === '2026-09-05' && g1.response === null);
  // Add to Other Calendars: the receipt page's calendar links need the full
  // description + listing url (the share SMS already discloses both to this
  // same token holder — no privacy expansion).
  check('GET returns full description + url for the calendar links',
    g1.description === 'Receipt API verification details.' && g1.url === 'https://example.com/receipt-verify');
  check('GET exposes no internal ids or other people',
    !('event_id' in g1) && !('person_id' in g1) && !('owner_id' in g1) && !('response_token' in g1) &&
    !('id' in g1) && !('send_id' in g1));

  // GET is inert (prefetch safety).
  const afterGet = await (
    await fetch(`${url}/rest/v1/sends?id=eq.${send.id}&select=response`, { headers })
  ).json();
  check('GET is inert (response still null)', afterGet[0].response === null);

  const post = (t, response) =>
    fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ t, response }),
    });

  const p1 = await (await post(send.response_token, 'yes')).json();
  check('POST yes → changed=true', p1.response === 'yes' && p1.changed === true);
  check('POST response does not reveal notify outcome', !('notified' in p1));

  const g2 = await (await fetch(`${API}?t=${send.response_token}`)).json();
  check('GET shows yes', g2.response === 'yes');

  const p2 = await (await post(send.response_token, 'yes')).json();
  check('POST yes again → changed=false', p2.changed === false);

  const p3 = await (await post(send.response_token, 'no')).json();
  check('POST no → changed=true (flip)', p3.response === 'no' && p3.changed === true);

  check('POST maybe → 400', (await post(send.response_token, 'maybe')).status === 400);
  check('unknown token → 404/404',
    (await fetch(`${API}?t=${crypto.randomUUID()}`)).status === 404 &&
    (await post(crypto.randomUUID(), 'yes')).status === 404);
  check('malformed token → 404/404 (no uuid-cast 500)',
    (await fetch(`${API}?t=not-a-uuid`)).status === 404 &&
    (await post('not-a-uuid', 'yes')).status === 404);

  const finalSend = await (
    await fetch(`${url}/rest/v1/sends?id=eq.${send.id}&select=response,responded_at`, { headers })
  ).json();
  check('asker reads response=no via RLS', finalSend[0].response === 'no' && !!finalSend[0].responded_at);
} finally {
  // Cleanup: delete the event (sends cascade) and the pending contact.
  await fetch(`${url}/rest/v1/events?id=eq.${eventId}&owner_id=eq.${uid}`, { method: 'DELETE', headers });
  if (personId) {
    await fetch(`${url}/rest/v1/my_people?id=eq.${personId}`, { method: 'DELETE', headers });
  }
  console.log('cleaned up');
}

if (failures) {
  console.error(`${failures} FAILURES`);
  process.exit(1);
}
console.log('ALL RECEIPT API CHECKS PASSED');
