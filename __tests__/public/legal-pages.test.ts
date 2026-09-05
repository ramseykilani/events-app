import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// A2P 10DLC (TCR 30908): reviewers load the production privacy URL and
// scan for this exact non-sharing clause. If it regresses, the campaign
// re-rejects. See docs/a2p-registration.md.
const TCR_NON_SHARING_CLAUSE =
  'No mobile information will be shared with third parties/affiliates for marketing/promotional purposes.';

function readPublic(name: string): string {
  return readFileSync(resolve(__dirname, '../../public', name), 'utf8');
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
});
