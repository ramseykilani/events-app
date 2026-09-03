import { buildSmsBody } from '../../supabase/functions/_shared/smsBody';

// The SMS body shape is the feature surface and no e2e can observe it
// (reserved 555 test numbers never reach Twilio), so pin it here. FEATURES.md
// → Coming Link in Every Share SMS: both variants carry the same receipt
// line when RESPONSE_LINK_BASE_URL is set; unset secret = null link = no line.

const LINK = 'https://events-reply.pages.dev/?t=token-123';

const baseParams = {
  eventTitle: 'Karaoke Night',
  dateLine: 'Fri, Sep 4, 8:00 PM',
  locationLine: null as string | null,
  descriptionLine: 'Bring your own songbook',
  eventUrl: 'https://example.com/karaoke',
  sharerName: 'Ramsey',
};

describe('buildSmsBody', () => {
  it('app-user variant carries the Coming? receipt link and no signup invite', () => {
    const body = buildSmsBody({ ...baseParams, signupInvite: false, responseLink: LINK });
    expect(body).toBe(
      'Ramsey wants to go to "Karaoke Night" with you\n' +
        'Fri, Sep 4, 8:00 PM\n' +
        'Bring your own songbook\n' +
        'https://example.com/karaoke\n' +
        '\n' +
        `Coming? ${LINK}\n` +
        '\n' +
        'Reply STOP to unsubscribe.',
    );
    expect(body).not.toContain('Want to invite your friends');
  });

  it('non-app variant carries the same Coming? line plus the signup invite', () => {
    const body = buildSmsBody({ ...baseParams, signupInvite: true, responseLink: LINK });
    expect(body).toBe(
      'Ramsey wants to go to "Karaoke Night" with you\n' +
        'Fri, Sep 4, 8:00 PM\n' +
        'Bring your own songbook\n' +
        'https://example.com/karaoke\n' +
        '\n' +
        `Coming? ${LINK}\n` +
        '\n' +
        'Want to invite your friends to things too? Get the beta: https://events-landing.pages.dev/signup\n' +
        '\n' +
        'Reply STOP to unsubscribe.',
    );
  });

  it.each([false, true])(
    'omits the Coming? line when the link is null (secret unset), signupInvite=%s',
    (signupInvite) => {
      const body = buildSmsBody({ ...baseParams, signupInvite, responseLink: null });
      expect(body).not.toContain('Coming?');
      expect(body).toContain('Reply STOP to unsubscribe.');
    },
  );

  it('orders the receipt link before the signup invite and the STOP footer', () => {
    const body = buildSmsBody({ ...baseParams, signupInvite: true, responseLink: LINK });
    const linkAt = body.indexOf('Coming?');
    expect(linkAt).toBeGreaterThan(-1);
    expect(linkAt).toBeLessThan(body.indexOf('Want to invite your friends'));
    expect(linkAt).toBeLessThan(body.indexOf('Reply STOP'));
  });

  it('falls back to "an event" and omits absent optional lines', () => {
    const body = buildSmsBody({
      eventTitle: null,
      dateLine: 'Sat, Sep 5',
      locationLine: null,
      descriptionLine: null,
      eventUrl: null,
      sharerName: '+15555550100',
      signupInvite: false,
      responseLink: LINK,
    });
    expect(body).toBe(
      '+15555550100 wants to go to an event with you\n' +
        'Sat, Sep 5\n' +
        '\n' +
        `Coming? ${LINK}\n` +
        '\n' +
        'Reply STOP to unsubscribe.',
    );
  });

  it('carries the venue line between the date and the description (Location feature)', () => {
    const body = buildSmsBody({
      ...baseParams,
      locationLine: 'Where: Signal, 175 Morgan Ave',
      signupInvite: false,
      responseLink: LINK,
    });
    expect(body).toBe(
      'Ramsey wants to go to "Karaoke Night" with you\n' +
        'Fri, Sep 4, 8:00 PM\n' +
        'Where: Signal, 175 Morgan Ave\n' +
        'Bring your own songbook\n' +
        'https://example.com/karaoke\n' +
        '\n' +
        `Coming? ${LINK}\n` +
        '\n' +
        'Reply STOP to unsubscribe.',
    );
  });

  it('omits the venue line when the event has no location', () => {
    const body = buildSmsBody({ ...baseParams, signupInvite: false, responseLink: LINK });
    expect(body).not.toContain('Where:');
  });
});
