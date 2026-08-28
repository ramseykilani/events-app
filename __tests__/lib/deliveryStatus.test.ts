import { shareDeliveryStatus } from '../../lib/deliveryStatus';

describe('lib/deliveryStatus', () => {
  const appUser = { user_id: 'u2' };
  const pendingContact = { user_id: null };

  it('app users always show the calendar copy as the delivery', () => {
    expect(shareDeliveryStatus(appUser, undefined)).toEqual({
      label: '✓ On their calendar',
      subLabel: null,
      tone: 'muted',
    });
  });

  it('app users keep the calendar label even when their SMS failed', () => {
    // The text is only a ping for app users — the event is on their calendar.
    expect(
      shareDeliveryStatus(appUser, { sms_status: 'failed', sms_error_code: '21610' })
    ).toEqual({
      label: '✓ On their calendar',
      subLabel: null,
      tone: 'muted',
    });
  });

  it('no SMS attempted (or a pre-feature row) falls back to the legacy label', () => {
    expect(shareDeliveryStatus(pendingContact, undefined).label).toBe('✓ Shared');
    expect(
      shareDeliveryStatus(pendingContact, { sms_status: null, sms_error_code: null }).label
    ).toBe('✓ Shared');
  });

  it('accepted but not yet terminal shows Sent', () => {
    for (const sms_status of ['queued', 'sent'] as const) {
      expect(
        shareDeliveryStatus(pendingContact, { sms_status, sms_error_code: null })
      ).toEqual({ label: '✓ Sent', subLabel: null, tone: 'muted' });
    }
  });

  it('delivered shows Delivered', () => {
    expect(
      shareDeliveryStatus(pendingContact, { sms_status: 'delivered', sms_error_code: null })
    ).toEqual({ label: '✓ Delivered', subLabel: null, tone: 'muted' });
  });

  it('terminal failures show Not delivered in the destructive tone', () => {
    for (const sms_status of ['undelivered', 'failed'] as const) {
      expect(
        shareDeliveryStatus(pendingContact, { sms_status, sms_error_code: '30034' })
      ).toEqual({ label: 'Not delivered', subLabel: null, tone: 'destructive' });
    }
  });

  it('a STOP unsubscribe (21610) is called out explicitly', () => {
    expect(
      shareDeliveryStatus(pendingContact, { sms_status: 'failed', sms_error_code: '21610' })
    ).toEqual({
      label: 'Not delivered',
      subLabel: 'They unsubscribed from texts',
      tone: 'destructive',
    });
  });
});
