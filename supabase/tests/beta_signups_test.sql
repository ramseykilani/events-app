-- Beta Signup Pipeline: the beta_signups table (migration
-- 20260903000001). Service-role only by design — RLS enabled with zero
-- policies, so anon/authenticated get default-deny and only the edge
-- functions (service role) read or write. This suite pins the schema
-- guards: name/platform/email/phone coherence CHECKs, the per-platform
-- status enums, and the RLS posture. The fulfillment state machines
-- themselves live in the beta-signup / beta-ios-fulfill edge functions.

\set ON_ERROR_STOP on

-- ===== T1: RLS is enabled =====
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'beta_signups' AND rowsecurity
  ) THEN
    RAISE EXCEPTION 'FAIL T1: RLS is not enabled on beta_signups';
  END IF;
  RAISE NOTICE 'PASS T1: RLS enabled';
END $$;

-- ===== T2: zero client policies (service-role only) =====
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'beta_signups'
  ) THEN
    RAISE EXCEPTION 'FAIL T2: a client policy exists on beta_signups';
  END IF;
  RAISE NOTICE 'PASS T2: no client policies';
END $$;

-- ===== T3: a valid row per platform inserts =====
INSERT INTO public.beta_signups
  (id, first_name, last_name, platform, apple_email, ios_status)
VALUES
  ('be000000-0000-0000-0000-000000000001', 'Ada', 'Lovelace', 'ios',
   'ada@example.com', 'pending');
INSERT INTO public.beta_signups
  (id, first_name, last_name, platform, play_email, phone, android_status)
VALUES
  ('be000000-0000-0000-0000-000000000002', 'Grace', 'Hopper', 'android',
   'grace@gmail.com', '+14165551234', 'pending');
INSERT INTO public.beta_signups
  (id, first_name, last_name, platform, apple_email, play_email, phone,
   ios_status, android_status)
VALUES
  ('be000000-0000-0000-0000-000000000003', 'Alan', 'Turing', 'both',
   'alan@example.com', 'alan@gmail.com', '+14165551235', 'pending', 'pending');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.beta_signups) <> 3 THEN
    RAISE EXCEPTION 'FAIL T3: expected 3 seed rows';
  END IF;
  RAISE NOTICE 'PASS T3: valid rows insert';
END $$;

-- ===== T4: platform must be in the enum =====
DO $$
BEGIN
  INSERT INTO public.beta_signups (first_name, last_name, platform)
  VALUES ('A', 'B', 'webos');
  RAISE EXCEPTION 'FAIL T4: a platform outside the enum was accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T4: bad platform rejected';
END $$;

-- ===== T5: platform/field coherence =====
-- ios without an Apple ID email
DO $$
BEGIN
  INSERT INTO public.beta_signups (first_name, last_name, platform, ios_status)
  VALUES ('A', 'B', 'ios', 'pending');
  RAISE EXCEPTION 'FAIL T5a: ios row without apple_email was accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T5a: ios requires apple_email';
END $$;
-- android without a Play Gmail
DO $$
BEGIN
  INSERT INTO public.beta_signups (first_name, last_name, platform, phone, android_status)
  VALUES ('A', 'B', 'android', '+14165551236', 'pending');
  RAISE EXCEPTION 'FAIL T5b: android row without play_email was accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T5b: android requires play_email';
END $$;
-- android without a phone (the completion SMS needs a number)
DO $$
BEGIN
  INSERT INTO public.beta_signups (first_name, last_name, platform, play_email, android_status)
  VALUES ('A', 'B', 'android', 'a@gmail.com', 'pending');
  RAISE EXCEPTION 'FAIL T5c: android row without phone was accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T5c: android requires phone';
END $$;
-- ios-only with a phone (nothing consumes it — not collected)
DO $$
BEGIN
  INSERT INTO public.beta_signups
    (first_name, last_name, platform, apple_email, phone, ios_status)
  VALUES ('A', 'B', 'ios', 'a@example.com', '+14165551237', 'pending');
  RAISE EXCEPTION 'FAIL T5d: ios-only row with phone was accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T5d: ios-only rejects phone';
END $$;
-- status presence must match the requested platform
DO $$
BEGIN
  INSERT INTO public.beta_signups
    (first_name, last_name, platform, apple_email, ios_status, android_status)
  VALUES ('A', 'B', 'ios', 'a@example.com', 'pending', 'pending');
  RAISE EXCEPTION 'FAIL T5e: ios row carrying android_status was accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T5e: status presence matches platform';
END $$;

-- ===== T6: status enums =====
DO $$
BEGIN
  UPDATE public.beta_signups SET ios_status = 'shipped'
  WHERE id = 'be000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'FAIL T6a: an ios_status outside the enum was accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T6a: ios_status enum enforced';
END $$;
DO $$
BEGIN
  UPDATE public.beta_signups SET android_status = 'invited'
  WHERE id = 'be000000-0000-0000-0000-000000000002';
  RAISE EXCEPTION 'FAIL T6b: android_status accepted an ios-only state';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T6b: android_status enum enforced';
END $$;

-- ===== T7: names must be non-empty =====
DO $$
BEGIN
  INSERT INTO public.beta_signups (first_name, last_name, platform, apple_email, ios_status)
  VALUES ('  ', 'B', 'ios', 'a@example.com', 'pending');
  RAISE EXCEPTION 'FAIL T7: a blank first name was accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T7: blank names rejected';
END $$;

-- ===== T8: one row per identity (unique indexes) =====
DO $$
BEGIN
  INSERT INTO public.beta_signups
    (first_name, last_name, platform, apple_email, ios_status)
  VALUES ('Ada', 'Again', 'ios', 'ada@example.com', 'pending');
  RAISE EXCEPTION 'FAIL T8: a duplicate apple_email was accepted';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'PASS T8: duplicate apple_email rejected';
END $$;
DO $$
BEGIN
  INSERT INTO public.beta_signups
    (first_name, last_name, platform, play_email, phone, android_status)
  VALUES ('Grace', 'Again', 'android', 'grace@gmail.com', '+19995551234', 'pending');
  RAISE EXCEPTION 'FAIL T8b: a duplicate play_email was accepted';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'PASS T8b: duplicate play_email rejected';
END $$;
-- NULLs never collide: a second iOS-only row (phone NULL) inserts fine.
INSERT INTO public.beta_signups
  (first_name, last_name, platform, apple_email, ios_status)
VALUES ('Edsger', 'Dijkstra', 'ios', 'edsger@example.com', 'pending');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.beta_signups) <> 4 THEN
    RAISE EXCEPTION 'FAIL T8c: expected 4 rows after NULL-phone insert';
  END IF;
  RAISE NOTICE 'PASS T8c: NULL phones do not collide';
END $$;

-- ===== T9: RLS for real — clients get nothing =====
-- The scratch DB has no Supabase default privileges; grant what the real
-- project grants so these checks exercise RLS, not missing grants (the
-- affiliate_programs_test.sql pattern).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_signups TO anon, authenticated;

-- T9a: authenticated SELECT sees zero rows even though four exist.
BEGIN;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.beta_signups) <> 0 THEN
    RAISE EXCEPTION 'FAIL T9a: authenticated can read beta_signups';
  END IF;
  RAISE NOTICE 'PASS T9a: authenticated SELECT denied';
END $$;
COMMIT;

-- T9b: anon INSERT is denied (RLS enabled, no policy → default deny).
BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  INSERT INTO public.beta_signups (first_name, last_name, platform, apple_email, ios_status)
  VALUES ('Rogue', 'Row', 'ios', 'rogue@example.com', 'pending');
  RAISE EXCEPTION 'FAIL T9b: anon inserted a signup row';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS T9b: anon INSERT denied';
END $$;
COMMIT;

-- T9c: authenticated UPDATE/DELETE silently affect nothing — the seed rows
-- survive untouched.
BEGIN;
SET LOCAL ROLE authenticated;
UPDATE public.beta_signups SET ios_status = 'added';
DELETE FROM public.beta_signups;
COMMIT;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.beta_signups) <> 4 THEN
    RAISE EXCEPTION 'FAIL T9c: authenticated DELETE removed rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.beta_signups WHERE ios_status = 'added') THEN
    RAISE EXCEPTION 'FAIL T9c: authenticated UPDATE modified rows';
  END IF;
  RAISE NOTICE 'PASS T9c: client writes affect nothing';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL BETA-SIGNUPS TESTS PASSED'; END $$;
