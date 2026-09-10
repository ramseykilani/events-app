import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// A2P 10DLC (TCR 30908): reviewers load the production privacy URL and
// scan for this exact non-sharing clause. If it regresses, the campaign
// re-rejects. See docs/a2p-registration.md.
const TCR_NON_SHARING_CLAUSE =
  'No mobile information will be shared with third parties/affiliates for marketing/promotional purposes.';

function readPublic(name: string): string {
  return readFileSync(resolve(__dirname, '../../public', name), 'utf8');
}

// The opt-in evidence page must quote the sign-in screen's consent line
// byte-for-byte (TCR 30909 — the reviewer string-matches the CTA). Extract
// it from the screen source so the page cannot drift from the app.
function signInConsentLine(): string {
  const source = readFileSync(
    resolve(__dirname, '../../app/(auth)/sign-in.tsx'),
    'utf8'
  );
  const match = source.match(/const CONSENT_LINE =\s*\n?\s*'([^']+)'/);
  if (!match) throw new Error('CONSENT_LINE not found in sign-in.tsx');
  return match[1];
}

describe('public legal pages (A2P evidence)', () => {
  it('privacy policy names the registered brand and carries the TCR clause', () => {
    const html = readPublic('privacy.html');

    expect(html).toContain('Shared Events — Privacy Policy');
    expect(html).toContain('Ramsey Kilani');
    expect(html).toContain(TCR_NON_SHARING_CLAUSE);
    expect(html).toContain(
      'text messaging originator opt-in data and consent; this information will not be shared with any third parties.'
    );
    expect(html).toContain(
      'Affiliate tagging does not share your mobile number or messaging consent'
    );
    expect(html).toContain('kilani.ramsey@gmail.com');
  });

  it('terms name the registered brand', () => {
    const html = readPublic('terms.html');

    expect(html).toContain('Shared Events — Terms of Service');
    expect(html).toContain('Ramsey Kilani');
    expect(html).toContain('Shared Events sends transactional SMS only');
    expect(html).toContain('kilani.ramsey@gmail.com');
  });

  // TCR 30909 (rejection #4): the sign-in screen is a JS app, so a
  // non-browser verifier sees an empty shell. opt-in.html is the
  // server-rendered evidence page the campaign's message_flow points at —
  // it must carry the verbatim consent line, the hosted screenshot, and
  // the required disclosures.
  it('opt-in evidence page quotes the live consent line and disclosures', () => {
    const html = readPublic('opt-in.html');
    const consentLine = signInConsentLine();

    expect(html).toContain('Shared Events — SMS Opt-In');
    expect(html).toContain('Ramsey Kilani');
    // HTML-escaped (& → &amp;) but otherwise byte-for-byte the screen text.
    expect(html).toContain(consentLine.replace(/&/g, '&amp;'));
    // The hosted screenshot of the real sign-in screen, and it exists.
    expect(html).toContain('src="opt-in-signin.png"');
    expect(
      existsSync(resolve(__dirname, '../../public/opt-in-signin.png'))
    ).toBe(true);
    // Both message legs and the required disclosures.
    expect(html).toContain(
      'Shared Events by Ramsey Kilani: [code] is your sign-in code. Reply STOP to opt out.'
    );
    expect(html).toContain('Reply STOP to unsubscribe.');
    expect(html).toContain('Message frequency varies');
    expect(html).toContain('Message and data rates may apply');
    expect(html).toContain('https://shared-events.pages.dev/terms');
    expect(html).toContain('https://shared-events.pages.dev/privacy');
    expect(html).toContain('kilani.ramsey@gmail.com');
  });
});
