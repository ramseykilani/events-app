-- Affiliate Link Tagging: the on/off registry (affiliate_programs +
-- affiliate_config). Ships dark (global off, no programs); activation is a
-- service-role SQL update, so this suite pins the schema guards: defaults,
-- the single-row config constraint, the template/domains CHECKs, and the
-- policy catalog (world-readable SELECT, no client write policies). The
-- tagging behavior itself is pinned by __tests__/edge-functions/
-- affiliateTag.test.ts (builder) and e2e/affiliate.spec.ts (tap behavior).

\set ON_ERROR_STOP on

-- ===== T1: the global switch exists and starts off (ships dark) =====
DO $$
DECLARE v record;
BEGIN
  SELECT enabled INTO v FROM public.affiliate_config WHERE id = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL T1: affiliate_config has no seed row';
  END IF;
  IF v.enabled IS NOT false THEN
    RAISE EXCEPTION 'FAIL T1: expected global enabled=false, got %', v.enabled;
  END IF;
  RAISE NOTICE 'PASS T1: global switch seeded off';
END $$;

-- ===== T2: the config table is single-row =====
DO $$
BEGIN
  INSERT INTO public.affiliate_config (id, enabled) VALUES (false, true);
  RAISE EXCEPTION 'FAIL T2: a second config row was accepted';
EXCEPTION WHEN check_violation OR unique_violation THEN
  RAISE NOTICE 'PASS T2: second config row rejected';
END $$;

-- ===== T3: a new program defaults to disabled =====
INSERT INTO public.affiliate_programs (id, domains, url_template) VALUES
  ('ticketmaster', '{ticketmaster.com,livenation.com,admission.com}',
   'https://example-network.test/click?u={url}');

DO $$
DECLARE v record;
BEGIN
  SELECT enabled INTO v FROM public.affiliate_programs WHERE id = 'ticketmaster';
  IF v.enabled IS NOT false THEN
    RAISE EXCEPTION 'FAIL T3: expected program enabled=false by default, got %', v.enabled;
  END IF;
  RAISE NOTICE 'PASS T3: new programs default to disabled';
END $$;

-- ===== T4: url_template must carry the {url} placeholder =====
DO $$
BEGIN
  INSERT INTO public.affiliate_programs (id, domains, url_template) VALUES
    ('bad-template', '{example.com}', 'https://example-network.test/click');
  RAISE EXCEPTION 'FAIL T4: a template without {url} was accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T4: template without {url} rejected';
END $$;

-- ===== T5: domains must be non-empty =====
DO $$
BEGIN
  INSERT INTO public.affiliate_programs (id, domains, url_template) VALUES
    ('no-domains', '{}', 'https://example-network.test/click?u={url}');
  RAISE EXCEPTION 'FAIL T5: an empty domains array was accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T5: empty domains rejected';
END $$;

-- ===== T6: RLS is enabled on both tables =====
DO $$
DECLARE v record;
BEGIN
  SELECT relrowsecurity INTO v FROM pg_class
    WHERE relname = 'affiliate_programs' AND relnamespace = 'public'::regnamespace;
  IF v.relrowsecurity IS NOT true THEN
    RAISE EXCEPTION 'FAIL T6: affiliate_programs does not have RLS enabled';
  END IF;
  SELECT relrowsecurity INTO v FROM pg_class
    WHERE relname = 'affiliate_config' AND relnamespace = 'public'::regnamespace;
  IF v.relrowsecurity IS NOT true THEN
    RAISE EXCEPTION 'FAIL T6: affiliate_config does not have RLS enabled';
  END IF;
  RAISE NOTICE 'PASS T6: RLS enabled on both registry tables';
END $$;

-- ===== T7: read-only from clients — a SELECT policy exists and no write
-- policy does (writes go through the service role, which bypasses RLS) =====
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'affiliate_programs' AND cmd = 'SELECT'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'affiliate_config' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'FAIL T7: missing SELECT policy on a registry table';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('affiliate_programs', 'affiliate_config')
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) THEN
    RAISE EXCEPTION 'FAIL T7: a client write policy exists on a registry table';
  END IF;
  RAISE NOTICE 'PASS T7: registry is client-read-only';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL AFFILIATE-PROGRAMS TESTS PASSED'; END $$;
