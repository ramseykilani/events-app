import {
  AffiliateRegistry,
  EMPTY_REGISTRY,
  tagListingUrl,
} from '../../supabase/functions/_shared/affiliateTag';

// Affiliate Link Tagging (FEATURES.md): pins the one tagging builder both
// taggable surfaces share (the app via lib/affiliateLinks.ts, send-response
// via _shared). The rules that protect the model: global/program off →
// byte-identical passthrough, unknown providers and aggregators →
// passthrough, matching is host-equals-or-subdomain against configured
// registered domains, and the tag wraps the percent-encoded ORIGINAL URL.

const TM_PROGRAM = {
  id: 'ticketmaster',
  domains: ['ticketmaster.com', 'livenation.com', 'admission.com'],
  url_template: 'https://network.test/click?u={url}',
  enabled: true,
};

const LIVE: AffiliateRegistry = { enabled: true, programs: [TM_PROGRAM] };

describe('tagListingUrl', () => {
  it('tags a URL whose host matches a live program', () => {
    expect(tagListingUrl('https://www.ticketmaster.com/event/abc', LIVE)).toBe(
      `https://network.test/click?u=${encodeURIComponent(
        'https://www.ticketmaster.com/event/abc'
      )}`
    );
  });

  it('matches subdomains of a configured domain', () => {
    expect(tagListingUrl('https://m.ticketmaster.com/x', LIVE)).toContain(
      'https://network.test/click?u='
    );
  });

  it('matches every domain a program covers', () => {
    expect(tagListingUrl('https://www.livenation.com/event/1', LIVE)).toContain(
      'https://network.test/click?u='
    );
    expect(tagListingUrl('https://admission.com/event/2', LIVE)).toContain(
      'https://network.test/click?u='
    );
  });

  it('matches regional domains only when configured', () => {
    const withRegional: AffiliateRegistry = {
      enabled: true,
      programs: [{ ...TM_PROGRAM, domains: [...TM_PROGRAM.domains, 'ticketmaster.co.uk'] }],
    };
    expect(tagListingUrl('https://www.ticketmaster.co.uk/e', withRegional)).toContain(
      'https://network.test/click?u='
    );
    // Not configured → not tagged (no public-suffix guessing).
    expect(tagListingUrl('https://www.ticketmaster.co.uk/e', LIVE)).toBe(
      'https://www.ticketmaster.co.uk/e'
    );
  });

  it('percent-encodes the whole original URL, query string included', () => {
    const url = 'https://www.ticketmaster.com/e?ref=share&x=1';
    expect(tagListingUrl(url, LIVE)).toBe(
      `https://network.test/click?u=${encodeURIComponent(url)}`
    );
  });

  it('passes through byte-identical when the global switch is off', () => {
    const url = 'https://www.ticketmaster.com/event/abc';
    expect(tagListingUrl(url, { ...LIVE, enabled: false })).toBe(url);
  });

  it('passes through byte-identical when the program is disabled', () => {
    const url = 'https://www.ticketmaster.com/event/abc';
    const registry: AffiliateRegistry = {
      enabled: true,
      programs: [{ ...TM_PROGRAM, enabled: false }],
    };
    expect(tagListingUrl(url, registry)).toBe(url);
  });

  it('passes through providers with no program byte-identical', () => {
    const url = 'https://partiful.com/e/xyz';
    expect(tagListingUrl(url, LIVE)).toBe(url);
  });

  it('never double-wraps: a network redirect host matches no program', () => {
    const url = 'https://network.test/click?u=https%3A%2F%2Fwww.ticketmaster.com%2Fevent%2Fabc';
    expect(tagListingUrl(url, LIVE)).toBe(url);
  });

  it('does not match lookalike suffixes of a configured domain', () => {
    const url = 'https://notticketmaster.com/event/abc';
    expect(tagListingUrl(url, LIVE)).toBe(url);
  });

  it('returns unparseable input unchanged', () => {
    expect(tagListingUrl('not a url', LIVE)).toBe('not a url');
  });

  it('the empty registry tags nothing', () => {
    const url = 'https://www.ticketmaster.com/event/abc';
    expect(tagListingUrl(url, EMPTY_REGISTRY)).toBe(url);
  });

  it('first matching program wins', () => {
    const registry: AffiliateRegistry = {
      enabled: true,
      programs: [
        TM_PROGRAM,
        { ...TM_PROGRAM, id: 'other', url_template: 'https://other.test/?u={url}' },
      ],
    };
    expect(tagListingUrl('https://www.ticketmaster.com/e', registry)).toContain(
      'https://network.test/click?u='
    );
  });
});
