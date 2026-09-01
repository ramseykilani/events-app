// Share-SMS body assembly for send-notification, extracted so the Jest
// suite can assert the body shape directly (reserved 555 test numbers never
// reach Twilio, so no e2e can observe a real text). Pure TypeScript — no
// Deno globals, no URL imports — on purpose.

// Internal-testing CTA (2026-08-17): while beta access is owner-gated
// (TestFlight / Play internal tracks), the SMS to recipients without an
// account invites them to email the owner to get signed up — an interested
// stranger has no other way in. App users already have the app, so their
// SMS carries no invite. At launch this line is replaced by store links
// for non-users, and app-user SMS gains an event deep link — same change,
// never one without the other (FEATURES.md → SMS Links at Launch).
const SIGNUP_INVITE_LINE =
  'Want to invite your friends to things too? Email kilani.ramsey@gmail.com to get signed up.';

export interface SmsBodyParams {
  eventTitle: string | null;
  dateLine: string;
  locationLine: string | null;
  descriptionLine: string | null;
  eventUrl: string | null;
  sharerName: string;
  signupInvite: boolean;
  responseLink: string | null;
}

// One message for both variants: the share framing (a share means "I
// want to go with you", not "this exists"), event details, the event's
// own URL when one exists, and the STOP footer — A2P best practice is
// opt-out instructions on every message, and Twilio intercepts STOP
// account-wide either way. No app/web links: the web app is a dev
// surface, not somewhere we want first impressions, and link-free SMS
// reads less like spam to carrier filters. The non-app variant also
// carries SIGNUP_INVITE_LINE — the one acquisition element, kept
// link-free. Launch pair (store link for non-users, event deep link
// for app users) is FEATURES.md → SMS Links at Launch; not before
// listings, never one variant without the other.
//
// Who's Coming: BOTH variants carry the per-send receipt link when
// RESPONSE_LINK_BASE_URL is set (FEATURES.md → Coming Link in Every
// Share SMS, decided 2026-08-31) — the share already is the ask, and
// answering must not require opening the app. The SMS is another way to
// answer, not a replacement for push or the in-app Yes/No. Unset the
// secret and the line disappears from both variants with no redeploy —
// also the strip switch if carriers or the A2P campaign hate it. The
// host is a receipt page, not the web app (docs/distribution-strategy.md).
// Wording is owner-approved on a real text (FEATURES.md → Who's Coming →
// Open Questions); the app-user variant reuses it byte-for-byte.
export function buildSmsBody({
  eventTitle,
  dateLine,
  locationLine,
  descriptionLine,
  eventUrl,
  sharerName,
  signupInvite,
  responseLink,
}: SmsBodyParams): string {
  const lines = [
    eventTitle
      ? `${sharerName} wants to go to "${eventTitle}" with you`
      : `${sharerName} wants to go to an event with you`,
    dateLine,
  ];
  // Location feature: the venue line goes right after the when, before the
  // what — null (empty location) leaves no trace.
  if (locationLine) lines.push(locationLine);
  if (descriptionLine) lines.push(descriptionLine);
  if (eventUrl) lines.push(eventUrl);
  if (responseLink) lines.push('', `Coming? ${responseLink}`);
  if (signupInvite) lines.push('', SIGNUP_INVITE_LINE);
  lines.push('', 'Reply STOP to unsubscribe.');
  return lines.join('\n');
}
