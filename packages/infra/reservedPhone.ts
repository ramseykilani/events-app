/**
 * NANP area code 555 is reserved / fictional. Twilio rejects these with
 * 21211 ("Invalid 'To' number"), which poisons messaging-health metrics.
 * Test accounts live in +1 555-555-01xx; skip every SMS to that area code.
 *
 * Keep the check in `supabase/functions/_shared/twilioSms.ts` in sync —
 * the edge functions cannot import this module at deploy time.
 */
export function isReservedTestPhone(
  phone: string | null | undefined
): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return /^1?555\d{7}$/.test(digits);
}
