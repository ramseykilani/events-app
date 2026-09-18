import type { Send } from './types';

// Share Delivery Status (FEATURES.md): what the sender sees per person on
// the share sheet, derived from the sends row's SMS delivery columns.
//
// Three one-word states; success is assumed and only failures surface (the
// Partiful model — "Invited" / "Error" / "Unsubscribed"; owner decision
// 2026-08-31). No sent/delivered ladder: carrier delivery receipts lag or
// never arrive even when the text did, so an in-transit window is noise.
// - "✓ Shared" — everyone, the moment the share completes, app users and SMS
//   contacts alike. For app users the calendar copy IS the delivery (their
//   SMS is only a ping, so even a failed ping never changes the label). For
//   SMS contacts the text is assumed through unless the carrier says otherwise.
// - "✕ Unsubscribed" — the carrier rejected the text with 21610 (Twilio
//   STOP): the one failure with a known cause, named so the sender knows why.
// - "✕ Undelivered" — any other terminal failure. States the fact without
//   claiming a cause (a phone that's off looks the same as a dead number).
//
// ✓ = it went out, ✕ = it didn't — every state carries a mark. Failures are
// destructive red per the design language (a consequence, not a record).

export type ShareDeliveryStatus = {
  label: string;
  // muted = theme.textTertiary (calm record); destructive = theme.destructiveText
  tone: 'muted' | 'destructive';
};

const MUTED: ShareDeliveryStatus['tone'] = 'muted';

export function shareDeliveryStatus(
  person: { user_id: string | null },
  send: Pick<Send, 'sms_status' | 'sms_error_code'> | undefined,
): ShareDeliveryStatus {
  if (person.user_id) {
    return { label: '✓ Shared', tone: MUTED };
  }
  switch (send?.sms_status) {
    case 'undelivered':
    case 'failed':
      return send?.sms_error_code === '21610'
        ? { label: '✕ Unsubscribed', tone: 'destructive' }
        : { label: '✕ Undelivered', tone: 'destructive' };
    default:
      return { label: '✓ Shared', tone: MUTED };
  }
}
