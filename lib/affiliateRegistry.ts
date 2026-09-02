// Affiliate Link Tagging (FEATURES.md): the app's read of the on/off
// registry (affiliate_config global switch + affiliate_programs rows). The
// registry rides screens that already load from Supabase — never the tap
// path — and every failure fails open to EMPTY_REGISTRY (untagged links,
// today's behavior): a tagging outage must never become a screen error.
//
// Cached module-wide with a short staleness window: the registry changes
// only when a program is activated by SQL, so a few minutes of staleness is
// invisible next to the days-long approval cadence.

import { supabase } from './supabase';
import { withFetchTimeout } from './timeoutSignal';
import {
  AffiliateProgram,
  AffiliateRegistry,
  EMPTY_REGISTRY,
} from './affiliateLinks';

const STALE_MS = 5 * 60 * 1000;

let cache: { registry: AffiliateRegistry; fetchedAt: number } | null = null;
let inFlight: Promise<AffiliateRegistry> | null = null;

export async function getAffiliateRegistry(): Promise<AffiliateRegistry> {
  if (cache && Date.now() - cache.fetchedAt < STALE_MS) return cache.registry;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const registry = await withFetchTimeout(async (signal) => {
        const [configResult, programsResult] = await Promise.all([
          supabase
            .from('affiliate_config')
            .select('enabled')
            .eq('id', true)
            .abortSignal(signal)
            .maybeSingle(),
          supabase
            .from('affiliate_programs')
            .select('id, domains, url_template, enabled')
            // Deterministic order so an overlapping pair of programs tags
            // identically on every surface (first match wins).
            .order('id')
            .abortSignal(signal),
        ]);
        if (configResult.error) throw configResult.error;
        if (programsResult.error) throw programsResult.error;
        return {
          enabled: (configResult.data as { enabled: boolean } | null)?.enabled === true,
          programs: (programsResult.data ?? []) as AffiliateProgram[],
        };
      });
      cache = { registry, fetchedAt: Date.now() };
      return registry;
    } catch (err) {
      console.error('Failed to load the affiliate registry:', err);
      // Stale cache beats none; with no cache, untagged is the safe default.
      return cache?.registry ?? EMPTY_REGISTRY;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// Test hook (the eventPreviewCache precedent): module state must not leak
// across Jest cases.
export function clearAffiliateRegistryCache(): void {
  cache = null;
  inFlight = null;
}
