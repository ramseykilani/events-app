// Beta Signup Pipeline (FEATURES.md): validation + normalization for the
// signup form's submissions, plus the two SMS bodies the pipeline sends
// (the per-signup owner alert and the Android completion text). Pure
// TypeScript — no Deno globals, no URL imports — so the Jest suite pins it
// directly (the smsBody.ts pattern). Phone normalization is a port of the
// app's libphonenumber-js behavior for the US-only form
// (lib/contacts.ts → normalizeToE164: US default, isPossible-lenient so
// reserved 555 numbers still normalize); edge functions can't import app
// lib at deploy time.

export type BetaPlatform = 'ios' | 'android' | 'both';

export interface BetaSubmission {
  firstName: string;
  lastName: string;
  platform: BetaPlatform;
  appleEmail: string | null;
  playEmail: string | null;
  phone: string | null; // E.164
}

export type BetaValidation =
  | { ok: true; submission: BetaSubmission }
  | { ok: false; error: string };

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const E164_RE = /^\+[1-9]\d{6,14}$/;

// US-default normalization: bare 10-digit numbers get +1; an explicit
// leading + keeps whatever country code follows. Anything else is rejected
// rather than guessed.
export function normalizeBetaPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    const e164 = `+${digits}`;
    return E164_RE.test(e164) ? e164 : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH) return null;
  return EMAIL_RE.test(email) ? email : null;
}

// Validates the raw form payload and returns the normalized row values.
// iOS-only signups deliberately carry no phone (nothing consumes it); the
// platform/field coherence here mirrors the table's CHECK constraints.
export function validateBetaSubmission(raw: unknown): BetaValidation {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Invalid submission.' };
  }
  const body = raw as Record<string, unknown>;

  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  if (!firstName) return { ok: false, error: 'First name is required.' };
  if (!lastName) return { ok: false, error: 'Last name is required.' };
  if (firstName.length > MAX_NAME_LENGTH || lastName.length > MAX_NAME_LENGTH) {
    return { ok: false, error: 'Names must be 100 characters or fewer.' };
  }

  const platform = body.platform;
  if (platform !== 'ios' && platform !== 'android' && platform !== 'both') {
    return { ok: false, error: 'Choose iOS, Android, or both.' };
  }
  const wantsIos = platform === 'ios' || platform === 'both';
  const wantsAndroid = platform === 'android' || platform === 'both';

  let appleEmail: string | null = null;
  if (wantsIos) {
    const rawEmail = typeof body.appleEmail === 'string' ? body.appleEmail.trim() : '';
    if (!rawEmail) {
      return { ok: false, error: 'Enter the email your Apple ID is under.' };
    }
    appleEmail = normalizeEmail(rawEmail);
    if (!appleEmail) {
      return { ok: false, error: "That Apple ID email doesn't look right." };
    }
  }

  let playEmail: string | null = null;
  let phone: string | null = null;
  if (wantsAndroid) {
    const rawEmail = typeof body.playEmail === 'string' ? body.playEmail.trim() : '';
    if (!rawEmail) {
      return { ok: false, error: 'Enter the Gmail your Play Store uses.' };
    }
    playEmail = normalizeEmail(rawEmail);
    if (!playEmail) {
      return { ok: false, error: "That Gmail address doesn't look right." };
    }
    const rawPhone = typeof body.phone === 'string' ? body.phone : '';
    if (!rawPhone.trim()) {
      return { ok: false, error: 'Enter your phone number so we can text you the testing link.' };
    }
    phone = normalizeBetaPhone(rawPhone);
    if (!phone) {
      return { ok: false, error: "That phone number doesn't look right." };
    }
  }

  return {
    ok: true,
    submission: { firstName, lastName, platform, appleEmail, playEmail, phone },
  };
}

export function betaPlatformLabel(platform: BetaPlatform): string {
  return platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'iOS + Android';
}

// One SMS to the owner per signup (the abuse tripwire — no approval gate,
// so every signup is visible). GSM-7-safe: straight quotes and hyphens
// only, so the alert prices at one segment.
export function buildOwnerAlertBody(s: BetaSubmission): string {
  const emails = [s.appleEmail, s.playEmail].filter(Boolean).join(' / ');
  return `New Events beta signup: ${s.firstName} ${s.lastName} (${betaPlatformLabel(
    s.platform,
  )}) - ${emails}`;
}

// The Android completion text, sent when the Grok Bot's webhook flips
// android_status to added. Owner approved a link in this SMS 2026-09-03 —
// a requested onboarding message, not a share notification, so the
// no-links rule for shares is untouched. The paste-in-Chrome instruction
// is load-bearing: Android hijacks play.google.com links into the Play
// Store app, which can't show the join page (STATUS.md → Testers).
export function buildAndroidCompletionBody({
  firstName,
  optInUrl,
}: {
  firstName: string;
  optInUrl: string;
}): string {
  return [
    `Hi ${firstName} - you're on the Events beta tester list for Android.`,
    '',
    "One step left: open this link in Chrome on your phone (copy and paste it into the address bar - tapping it opens the Play Store, which can't join you):",
    optInUrl,
    '',
    'Tap "Become a tester" there, then install Events from the Play Store.',
    '',
    'Reply STOP to unsubscribe.',
  ].join('\n');
}
