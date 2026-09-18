// Affiliate Link Tagging (FEATURES.md): the pure URL rewriter shared by the
// app (via lib/affiliateLinks.ts) and the send-response edge function, and
// pinned directly by Jest — the smsBody.ts pattern: pure TypeScript, no Deno
// globals, no URL imports, so one source of truth keeps both taggable
// surfaces byte-identical in behavior.
//
// The registry rows come from the affiliate_programs / affiliate_config
// tables (migration 20260902000001). The rules that matter:
// - global off or program disabled → the URL passes through byte-identical;
// - a program matches when the URL's host equals or is a subdomain of one of
//   its configured registered domains (regional TLDs are listed explicitly —
//   no public-suffix machinery);
// - the tag is the program's template with {url} replaced by the
//   percent-encoded ORIGINAL URL (query string included);
// - anything else — unknown providers, aggregators, already-wrapped
//   affiliate hops (their host is the network's domain, never a configured
//   one) — passes through untouched. The share SMS never calls this.

export interface AffiliateProgram {
  id: string;
  domains: string[];
  url_template: string;
  enabled: boolean;
}

export interface AffiliateRegistry {
  enabled: boolean;
  programs: AffiliateProgram[];
}

// The fail-open value: any registry fetch failure degrades to today's
// behavior (untagged links), never to a broken tap.
export const EMPTY_REGISTRY: AffiliateRegistry = { enabled: false, programs: [] };

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain);
}

export function tagListingUrl(url: string, registry: AffiliateRegistry): string {
  if (!registry.enabled) return url;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
  for (const program of registry.programs) {
    if (!program.enabled) continue;
    if (program.domains.some((d) => hostMatches(host, d.toLowerCase()))) {
      return program.url_template.replace('{url}', encodeURIComponent(url));
    }
  }
  return url;
}
