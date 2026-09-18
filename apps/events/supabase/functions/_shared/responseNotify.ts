import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendExpoPush } from './expoPush.ts';

// Who's Coming: push the asker when a recipient's answer changes. Shared by
// send-response-notification (in-app path, JWT-verified) and send-response
// (SMS receipt page, token-authed) so both write paths notify identically:
// honor the asker's notify_push pref, never push when the asker has hidden
// the responder (same rule as share notifications, opposite direction), and
// carry the ASKER'S own row id so the tap opens their event detail with the
// "Shared with" answers. Push only — never an SMS per answer.

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

export async function notifyAskerOfResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, 'public', any>,
  sendId: string,
): Promise<'sent' | 'skipped'> {
  const { data: send } = await db
    .from('sends')
    .select('id, response, event_id, person_id')
    .eq('id', sendId)
    .maybeSingle();
  if (!send?.response) return 'skipped';

  const [{ data: event }, { data: person }] = await Promise.all([
    db
      .from('events')
      .select('id, owner_id, title, event_date, event_time')
      .eq('id', send.event_id)
      .maybeSingle(),
    db
      .from('my_people')
      .select('contact_name, phone_number, user_id')
      .eq('id', send.person_id)
      .maybeSingle(),
  ]);
  if (!event || !person) return 'skipped';

  const { data: hidden } = await db
    .from('hidden_people')
    .select('id')
    .eq('owner_id', event.owner_id)
    .eq('person_id', send.person_id)
    .maybeSingle();
  if (hidden) return 'skipped';

  const { data: asker } = await db
    .from('users')
    .select('expo_push_token, notify_push')
    .eq('id', event.owner_id)
    .maybeSingle();
  if (!asker?.expo_push_token || asker.notify_push === false) return 'skipped';

  // Attribution mirrors shares: the asker's own label for the responder,
  // then the responder's display name, then the raw phone number.
  let responderName: string | null = person.contact_name;
  if (!responderName && person.user_id) {
    const { data: responder } = await db
      .from('users')
      .select('display_name')
      .eq('id', person.user_id)
      .maybeSingle();
    responderName = responder?.display_name ?? null;
  }
  responderName = responderName ?? person.phone_number ?? 'Someone';

  const dateLine = `${formatDate(event.event_date)}${
    event.event_time ? `, ${formatTime(event.event_time)}` : ''
  }`;

  await sendExpoPush(db, [
    {
      to: asker.expo_push_token,
      title: `${responderName} said ${send.response}`,
      body: event.title ? `${event.title} · ${dateLine}` : dateLine,
      data: { eventId: event.id },
    },
  ]);
  return 'sent';
}
