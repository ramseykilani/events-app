// Affiliate Link Tagging (FEATURES.md): app-side entry point for the pure
// tagging builder. The implementation lives in
// supabase/functions/_shared/affiliateTag.ts so the app and the
// send-response edge function tag byte-identically (one source of truth,
// Jest-pinned — the smsBody.ts pattern). The registry it consumes comes from
// lib/affiliateRegistry.ts; both taggable surfaces fail open to untagged.
export {
  EMPTY_REGISTRY,
  tagListingUrl,
} from '../supabase/functions/_shared/affiliateTag';
export type {
  AffiliateProgram,
  AffiliateRegistry,
} from '../supabase/functions/_shared/affiliateTag';
