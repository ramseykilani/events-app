import type { Send } from './types';

// Share Delivery Status (FEATURES.md): what the sender sees per person on
// the share sheet, derived from the sends row's SMS delivery columns.
//
// "Received" means different things per recipient kind:
// - App users got the event the moment share_event ran — their calendar copy
//   IS the delivery, so they always show "✓ On their calendar". Their SMS
//   (when enabled) is tracked but is only a ping; push stays best-effort.
// - Contacts without an account get only the SMS, so its Twilio status is
//   the signal: accepted ("✓ Sent") → "✓ Delivered", or a terminal failure
//   shown as "Not delivered" — with an explicit unsubscribed note for 21610
//   (Twilio STOP), the case the feature exists to surface.
// - NULL sms_status means no SMS was attempted (or a pre-feature row) — the
//   honest label is the legacy "✓ Shared" (recorded, delivery unknown).

export type ShareDeliveryStatus = {
  label: string;
  subLabel: string | null;
  // muted = theme.textTertiary (calm record); destructive = theme.destructiveText
  // (the message never made it — a consequence, so red per the design language).
  tone: 'muted' | 'destructive';
};

const MUTED: ShareDeliveryStatus['tone'] = 'muted';

export function shareDeliveryStatus(
  person: { user_id: string | null },
  send: Pick<Send, 'sms_status' | 'sms_error_code'> | undefined,
): ShareDeliveryStatus {
  if (person.user_id) {
    return { label: '✓ On their calendar', subLabel: null, tone: MUTED };
  }
  switch (send?.sms_status) {
    case 'queued':
    case 'sent':
      return { label: '✓ Sent', subLabel: null, tone: MUTED };
    case 'delivered':
      return { label: '✓ Delivered', subLabel: null, tone: MUTED };
    case 'undelivered':
    case 'failed':
      return {
        label: 'Not delivered',
        subLabel:
          send?.sms_error_code === '21610'
            ? 'They unsubscribed from texts'
            : null,
        tone: 'destructive',
      };
    default:
      return { label: '✓ Shared', subLabel: null, tone: MUTED };
  }
}
