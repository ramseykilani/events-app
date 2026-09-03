import {
  buildAndroidCompletionBody,
  buildOwnerAlertBody,
  normalizeBetaPhone,
  validateBetaSubmission,
} from '../../supabase/functions/_shared/betaSignup';

// Beta Signup Pipeline: the form's validation/normalization and the two SMS
// bodies are the feature surface — the completion text goes to real phones
// and no e2e observes it (reserved 555 numbers never reach Twilio), so pin
// both here. The table's CHECK constraints mirror the platform/field
// coherence rules; supabase/tests/beta_signups_test.sql pins those.

describe('normalizeBetaPhone', () => {
  it('normalizes US formats to E.164', () => {
    expect(normalizeBetaPhone('(416) 555-1234')).toBe('+14165551234');
    expect(normalizeBetaPhone('416-555-1234')).toBe('+14165551234');
    expect(normalizeBetaPhone('4165551234')).toBe('+14165551234');
    expect(normalizeBetaPhone('1 (416) 555-1234')).toBe('+14165551234');
    expect(normalizeBetaPhone('+1 416 555 1234')).toBe('+14165551234');
    expect(normalizeBetaPhone('+14165551234')).toBe('+14165551234');
  });

  it('keeps explicit international numbers and rejects stubs', () => {
    expect(normalizeBetaPhone('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizeBetaPhone('555')).toBeNull();
    expect(normalizeBetaPhone('')).toBeNull();
    expect(normalizeBetaPhone('   ')).toBeNull();
    // No leading + and not a US shape — rejected rather than guessed.
    expect(normalizeBetaPhone('44 20 7946 0958')).toBeNull();
    // A leading + with a 0 country code is not E.164.
    expect(normalizeBetaPhone('+0123456789')).toBeNull();
  });
});

describe('validateBetaSubmission', () => {
  it('accepts a complete iOS submission and drops the android fields', () => {
    const result = validateBetaSubmission({
      firstName: ' Ada ',
      lastName: 'Lovelace',
      platform: 'ios',
      appleEmail: 'ADA@Example.com ',
      playEmail: 'ignored@gmail.com',
      phone: '(416) 555-1234',
    });
    expect(result).toEqual({
      ok: true,
      submission: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        platform: 'ios',
        appleEmail: 'ada@example.com',
        playEmail: null,
        phone: null,
      },
    });
  });

  it('accepts a complete android submission with a normalized phone', () => {
    const result = validateBetaSubmission({
      firstName: 'Grace',
      lastName: 'Hopper',
      platform: 'android',
      playEmail: 'Grace@Gmail.com',
      phone: '(416) 555-1234',
    });
    expect(result).toEqual({
      ok: true,
      submission: {
        firstName: 'Grace',
        lastName: 'Hopper',
        platform: 'android',
        appleEmail: null,
        playEmail: 'grace@gmail.com',
        phone: '+14165551234',
      },
    });
  });

  it('accepts both platforms with all fields', () => {
    const result = validateBetaSubmission({
      firstName: 'Alan',
      lastName: 'Turing',
      platform: 'both',
      appleEmail: 'alan@example.com',
      playEmail: 'alan@gmail.com',
      phone: '+14165551235',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.submission.appleEmail).toBe('alan@example.com');
      expect(result.submission.playEmail).toBe('alan@gmail.com');
      expect(result.submission.phone).toBe('+14165551235');
    }
  });

  it.each([
    [{ firstName: '', lastName: 'B', platform: 'ios', appleEmail: 'a@b.co' }, 'First name is required.'],
    [{ firstName: 'A', lastName: ' ', platform: 'ios', appleEmail: 'a@b.co' }, 'Last name is required.'],
    [{ firstName: 'A', lastName: 'B', platform: 'webos' }, 'Choose iOS, Android, or both.'],
    [{ firstName: 'A', lastName: 'B', platform: 'ios' }, 'Enter the email your Apple ID is under.'],
    [
      { firstName: 'A', lastName: 'B', platform: 'ios', appleEmail: 'not-an-email' },
      "That Apple ID email doesn't look right.",
    ],
    [{ firstName: 'A', lastName: 'B', platform: 'android' }, 'Enter the Gmail your Play Store uses.'],
    [
      { firstName: 'A', lastName: 'B', platform: 'android', playEmail: 'a@gmail' },
      "That Gmail address doesn't look right.",
    ],
    [
      { firstName: 'A', lastName: 'B', platform: 'android', playEmail: 'a@gmail.com' },
      'Enter your phone number so we can text you the testing link.',
    ],
    [
      { firstName: 'A', lastName: 'B', platform: 'android', playEmail: 'a@gmail.com', phone: '555' },
      "That phone number doesn't look right.",
    ],
  ])('rejects %o with a human error', (input, error) => {
    expect(validateBetaSubmission(input)).toEqual({ ok: false, error });
  });

  it('rejects non-object payloads', () => {
    expect(validateBetaSubmission(null)).toEqual({ ok: false, error: 'Invalid submission.' });
    expect(validateBetaSubmission('x')).toEqual({ ok: false, error: 'Invalid submission.' });
  });
});

describe('buildOwnerAlertBody', () => {
  it('carries name, platform label, and the relevant emails', () => {
    expect(
      buildOwnerAlertBody({
        firstName: 'Ada',
        lastName: 'Lovelace',
        platform: 'ios',
        appleEmail: 'ada@example.com',
        playEmail: null,
        phone: null,
      }),
    ).toBe('New Events beta signup: Ada Lovelace (iOS) - ada@example.com');
    expect(
      buildOwnerAlertBody({
        firstName: 'Alan',
        lastName: 'Turing',
        platform: 'both',
        appleEmail: 'alan@example.com',
        playEmail: 'alan@gmail.com',
        phone: '+14165551235',
      }),
    ).toBe('New Events beta signup: Alan Turing (iOS + Android) - alan@example.com / alan@gmail.com');
  });
});

describe('buildAndroidCompletionBody', () => {
  it('carries the opt-in link, the Chrome instruction, and STOP', () => {
    const body = buildAndroidCompletionBody({
      firstName: 'Grace',
      optInUrl: 'https://play.google.com/apps/internaltest/123',
    });
    expect(body).toBe(
      "Hi Grace - you're on the Events beta tester list for Android.\n" +
        '\n' +
        "One step left: open this link in Chrome on your phone (copy and paste it into the address bar - tapping it opens the Play Store, which can't join you):\n" +
        'https://play.google.com/apps/internaltest/123\n' +
        '\n' +
        'Tap "Become a tester" there, then install Events from the Play Store.\n' +
        '\n' +
        'Reply STOP to unsubscribe.',
    );
  });

  it('stays GSM-7 safe (one non-GSM char would force UCS-2 pricing)', () => {
    const body = buildAndroidCompletionBody({
      firstName: 'Grace',
      optInUrl: 'https://play.google.com/apps/internaltest/123',
    });
    // Curly quotes, en/em dashes, and ellipses are the usual UCS-2 triggers.
    expect(body).not.toMatch(/[\u2018\u2019\u201C\u201D\u2013\u2014\u2015\u2026]/);
  });
});
