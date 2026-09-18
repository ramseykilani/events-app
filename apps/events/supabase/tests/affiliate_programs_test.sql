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

-- ===== T7: read-only from clients — a world-readable SELECT policy exists
-- and no write policy does (writes go through the service role, which
-- bypasses RLS) =====
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'affiliate_programs'
      AND cmd = 'SELECT' AND qual = 'true'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'affiliate_config'
      AND cmd = 'SELECT' AND qual = 'true'
  ) THEN
    RAISE EXCEPTION 'FAIL T7: missing world-readable SELECT policy on a registry table';
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

-- ===== T8: RLS for real — clients read, never write =====
-- The scratch DB has no Supabase default privileges; grant what the real
-- project grants so these checks exercise RLS, not missing grants (the
-- archive_test.sql pattern).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_programs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_config TO anon, authenticated;

-- T8a: authenticated reads both tables (world-readable config).
BEGIN;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_programs integer; v_config boolean;
BEGIN
  SELECT count(*) INTO v_programs FROM public.affiliate_programs;
  SELECT enabled INTO v_config FROM public.affiliate_config WHERE id = true;
  IF v_programs < 1 OR v_config IS NULL THEN
    RAISE EXCEPTION 'FAIL T8a: authenticated cannot read the registry';
  END IF;
  RAISE NOTICE 'PASS T8a: authenticated reads the registry';
END $$;
COMMIT;

-- T8b: INSERT is denied (RLS enabled, no write policy → default deny).
BEGIN;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.affiliate_programs (id, domains, url_template) VALUES
    ('rogue', '{rogue.example}', 'https://rogue.test/?u={url}');
  RAISE EXCEPTION 'FAIL T8b: authenticated inserted a program row';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS T8b: authenticated INSERT denied';
END $$;
COMMIT;

-- T8c: anon UPDATE/DELETE silently affect nothing (default deny) — the
-- T3 row stays disabled and the config row survives.
BEGIN;
SET LOCAL ROLE anon;
UPDATE public.affiliate_programs SET enabled = true WHERE id = 'ticketmaster';
DELETE FROM public.affiliate_config WHERE id = true;
COMMIT;

DO $$
DECLARE v record;
BEGIN
  SELECT enabled INTO v FROM public.affiliate_programs WHERE id = 'ticketmaster';
  IF v.enabled IS NOT false THEN
    RAISE EXCEPTION 'FAIL T8c: anon UPDATE modified a program';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.affiliate_config WHERE id = true) THEN
    RAISE EXCEPTION 'FAIL T8c: anon DELETE removed the config row';
  END IF;
  RAISE NOTICE 'PASS T8c: anon writes affect nothing';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL AFFILIATE-PROGRAMS TESTS PASSED'; END $$;
