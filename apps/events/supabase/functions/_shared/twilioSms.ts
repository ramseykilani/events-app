// Twilio Messages API sender, shared by every SMS-sending edge function
// (send-notification's share texts; beta-signup's owner alert and Android
// completion text). Extracted 2026-09-03 for the Beta Signup Pipeline —
// behavior is byte-identical to the copy that lived in send-notification.

// NANP area code 555 is reserved / fictional. Twilio rejects these with
// 21211, which poisons messaging-health metrics. Keep in sync with
// lib/reservedPhone.ts (edge functions cannot import app lib at deploy time).
export function isReservedTestPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return /^1?555\d{7}$/.test(digits);
}

// Result of a Twilio Messages API call. 'sent' only means Twilio ACCEPTED
// the message — the carrier can still fail it; terminal states arrive via
// the StatusCallback webhook (twilio-status function). 'rejected' is a
// synchronous 21xxx error from the API itself.
export type SmsResult =
  | { status: 'sent'; sid: string | null }
  | { status: 'rejected'; errorCode: number | null; errorMessage: string | null }
  | { status: 'skipped' };

// Twilio accepts either MessagingServiceSid (sender pool, built-in STOP
// opt-out handling) or a bare From number — never both.
export type SmsSender = { messagingServiceSid?: string; fromNumber?: string };

export async function sendSms(
  to: string,
  body: string,
  accountSid: string,
  authToken: string,
  sender: SmsSender,
  statusCallbackUrl?: string,
): Promise<SmsResult> {
  if (isReservedTestPhone(to)) return { status: 'skipped' };
  const credentials = btoa(`${accountSid}:${authToken}`);
  const params = new URLSearchParams({ To: to, Body: body });
  if (sender.messagingServiceSid) {
    params.set('MessagingServiceSid', sender.messagingServiceSid);
  } else if (sender.fromNumber) {
    params.set('From', sender.fromNumber);
  } else {
    return { status: 'skipped' };
  }
  // Per-message StatusCallback overrides the Messaging Service's callback
  // URL, so delivery-status webhooks are wired entirely here — no Twilio
  // console configuration.
  if (statusCallbackUrl) params.set('StatusCallback', statusCallbackUrl);
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    },
  );
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    // Synchronous rejection (21xxx). Until the response was parsed these
    // were invisible outside the Twilio console — the 2026-08-17 diagnosis
    // found carrier-blocked (30034) and landline (30006) failures with zero
    // trace in our own logs.
    console.error('Twilio SMS rejected:', {
      to,
      httpStatus: res.status,
      errorCode: payload?.code ?? null,
      errorMessage: payload?.message ?? null,
    });
    return {
      status: 'rejected',
      errorCode: payload?.code ?? null,
      errorMessage: payload?.message ?? null,
    };
  }
  return { status: 'sent', sid: payload?.sid ?? null };
}
