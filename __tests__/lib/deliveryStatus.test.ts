import { shareDeliveryStatus } from '../../lib/deliveryStatus';

describe('lib/deliveryStatus', () => {
  const appUser = { user_id: 'u2' };
  const pendingContact = { user_id: null };

  it('app users always show Shared — the calendar copy is the delivery', () => {
    expect(shareDeliveryStatus(appUser, undefined)).toEqual({
      label: '✓ Shared',
      tone: 'muted',
    });
  });

  it('app users keep Shared even when their SMS ping failed', () => {
    // The text is only a ping for app users — the event is on their calendar.
    expect(
      shareDeliveryStatus(appUser, { sms_status: 'failed', sms_error_code: '21610' })
    ).toEqual({ label: '✓ Shared', tone: 'muted' });
  });

  it('success is assumed for SMS contacts: queued, sent, delivered, and untracked all show Shared', () => {
    expect(shareDeliveryStatus(pendingContact, undefined)).toEqual({
      label: '✓ Shared',
      tone: 'muted',
    });
    for (const sms_status of ['queued', 'sent', 'delivered', null] as const) {
      expect(
        shareDeliveryStatus(pendingContact, { sms_status, sms_error_code: null })
      ).toEqual({ label: '✓ Shared', tone: 'muted' });
    }
  });

  it('a STOP unsubscribe (21610) is named: Unsubscribed', () => {
    expect(
      shareDeliveryStatus(pendingContact, { sms_status: 'failed', sms_error_code: '21610' })
    ).toEqual({ label: '✕ Unsubscribed', tone: 'destructive' });
  });

  it('any other terminal failure shows Undelivered in the destructive tone', () => {
    for (const sms_status of ['undelivered', 'failed'] as const) {
      expect(
        shareDeliveryStatus(pendingContact, { sms_status, sms_error_code: '30034' })
      ).toEqual({ label: '✕ Undelivered', tone: 'destructive' });
    }
    // No error code at all — still just Undelivered, no cause claimed.
    expect(
      shareDeliveryStatus(pendingContact, { sms_status: 'undelivered', sms_error_code: null })
    ).toEqual({ label: '✕ Undelivered', tone: 'destructive' });
  });
});
