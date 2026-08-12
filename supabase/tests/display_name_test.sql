-- Functional test of display names: CHECK constraint, and calendar
-- attribution falling back to the sharer's display_name when the recipient
-- has no contact_name for them.
-- Impersonation: SET request.jwt.claim.sub to the user's uuid (auth.uid() reads it).

\set ON_ERROR_STOP on

-- Cast (fixed UUIDs, 'dd00' prefix to stay clear of the other suites)
-- users: A=dd000000-...-000a (display_name 'Ramsey')  B=dd000000-...-000b (recipient)
--        C=dd000000-...-000c (no display name)
-- events: E=dd0eeeee-...-0001 (A shares to B)  E2=dd0eeeee-...-0002 (C shares to B)
-- my_people: A->B dd011111-...-0001, C->B dd011111-...-0002, B->A dd011111-...-0003

INSERT INTO auth.users (id, phone) VALUES
  ('dd000000-0000-0000-0000-00000000000a', '+15555550300'),
  ('dd000000-0000-0000-0000-00000000000b', '+15555550301'),
  ('dd000000-0000-0000-0000-00000000000c', '+15555550302');
-- handle_new_auth_user trigger inserts public.users rows automatically

-- ===== T1: CHECK constraint is the validation boundary =====
-- (RLS lets users write their own row via raw REST; the value lands
-- unescaped at the start of an SMS body, so the DB must reject bad names.)
DO $$
BEGIN
  UPDATE public.users SET display_name = '' WHERE id = 'dd000000-0000-0000-0000-00000000000a';
  RAISE EXCEPTION 'FAIL T1a: empty name accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T1a: empty name rejected';
END $$;

DO $$
BEGIN
  UPDATE public.users SET display_name = '   ' WHERE id = 'dd000000-0000-0000-0000-00000000000a';
  RAISE EXCEPTION 'FAIL T1b: whitespace-only name accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T1b: whitespace-only name rejected';
END $$;

DO $$
BEGIN
  UPDATE public.users SET display_name = repeat('x', 51) WHERE id = 'dd000000-0000-0000-0000-00000000000a';
  RAISE EXCEPTION 'FAIL T1c: 51-char name accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T1c: over-length name rejected';
END $$;

DO $$
BEGIN
  UPDATE public.users SET display_name = 'Bad' || chr(10) || 'Name' WHERE id = 'dd000000-0000-0000-0000-00000000000a';
  RAISE EXCEPTION 'FAIL T1d: newline name accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T1d: newline name rejected';
END $$;

-- Valid values: a normal name and NULL (never-set) must both be accepted.
UPDATE public.users SET display_name = 'Ramsey' WHERE id = 'dd000000-0000-0000-0000-00000000000a';
UPDATE public.users SET display_name = NULL WHERE id = 'dd000000-0000-0000-0000-00000000000a';
UPDATE public.users SET display_name = 'Ramsey' WHERE id = 'dd000000-0000-0000-0000-00000000000a';
DO $$
BEGIN
  IF (SELECT display_name FROM public.users WHERE id = 'dd000000-0000-0000-0000-00000000000a') IS DISTINCT FROM 'Ramsey' THEN
    RAISE EXCEPTION 'FAIL T1e: valid name did not persist';
  END IF;
  RAISE NOTICE 'PASS T1e: valid and NULL names accepted';
END $$;

-- ===== T2: attribution falls back to display_name when no contact row =====
-- A shares E to B. B has NO my_people row for A.
INSERT INTO public.events (id, created_by_user_id, title, event_date) VALUES
  ('dd0eeeee-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-00000000000a', 'Rooftop Cinema', '2026-09-25');
INSERT INTO public.user_events (id, user_id, event_id) VALUES
  ('dd0becef-0000-0000-0000-00000000000a', 'dd000000-0000-0000-0000-00000000000a', 'dd0eeeee-0000-0000-0000-000000000001');
INSERT INTO public.my_people (id, owner_id, phone_number, contact_name) VALUES
  ('dd011111-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-00000000000a', '+15555550301', 'Bee');

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-00000000000a', true);
SELECT public.share_event(
  'dd0becef-0000-0000-0000-00000000000a',
  ARRAY['dd011111-0000-0000-0000-000000000001']::uuid[]
);
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events('dd000000-0000-0000-0000-00000000000b', '2026-01-01', '2027-12-31')
    WHERE event_id = 'dd0eeeee-0000-0000-0000-000000000001';
  IF v IS NULL THEN RAISE EXCEPTION 'FAIL T2: B did not receive the event'; END IF;
  IF v.sharer_contact_name IS DISTINCT FROM 'Ramsey' THEN
    RAISE EXCEPTION 'FAIL T2: expected display_name attribution Ramsey, got %', v.sharer_contact_name;
  END IF;
  RAISE NOTICE 'PASS T2: display_name used when recipient has no contact for sharer';
END $$;
COMMIT;

-- ===== T3: the recipient's own contact_name always wins =====
INSERT INTO public.my_people (id, owner_id, phone_number, contact_name) VALUES
  ('dd011111-0000-0000-0000-000000000003', 'dd000000-0000-0000-0000-00000000000b', '+15555550300', 'Ay');

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events('dd000000-0000-0000-0000-00000000000b', '2026-01-01', '2027-12-31')
    WHERE event_id = 'dd0eeeee-0000-0000-0000-000000000001';
  IF v.sharer_contact_name IS DISTINCT FROM 'Ay' THEN
    RAISE EXCEPTION 'FAIL T3: expected contact_name Ay to win, got %', v.sharer_contact_name;
  END IF;
  RAISE NOTICE 'PASS T3: contact_name wins over display_name';
END $$;
COMMIT;

-- A contact row with NULL contact_name still falls back to display_name.
UPDATE public.my_people SET contact_name = NULL WHERE id = 'dd011111-0000-0000-0000-000000000003';

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events('dd000000-0000-0000-0000-00000000000b', '2026-01-01', '2027-12-31')
    WHERE event_id = 'dd0eeeee-0000-0000-0000-000000000001';
  IF v.sharer_contact_name IS DISTINCT FROM 'Ramsey' THEN
    RAISE EXCEPTION 'FAIL T3b: expected display_name fallback, got %', v.sharer_contact_name;
  END IF;
  RAISE NOTICE 'PASS T3b: NULL contact_name falls back to display_name';
END $$;
COMMIT;

-- ===== T4: NULL display_name + no contact row -> attribution stays NULL =====
-- C (no name) shares E2 to B. B has no contact row for C.
INSERT INTO public.events (id, created_by_user_id, title, event_date) VALUES
  ('dd0eeeee-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-00000000000c', 'Garage Sale', '2026-09-26');
INSERT INTO public.user_events (id, user_id, event_id) VALUES
  ('dd0becef-0000-0000-0000-00000000000c', 'dd000000-0000-0000-0000-00000000000c', 'dd0eeeee-0000-0000-0000-000000000002');
INSERT INTO public.my_people (id, owner_id, phone_number, contact_name) VALUES
  ('dd011111-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-00000000000c', '+15555550301', 'Bee');

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-00000000000c', true);
SELECT public.share_event(
  'dd0becef-0000-0000-0000-00000000000c',
  ARRAY['dd011111-0000-0000-0000-000000000002']::uuid[]
);
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'dd000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events('dd000000-0000-0000-0000-00000000000b', '2026-01-01', '2027-12-31')
    WHERE event_id = 'dd0eeeee-0000-0000-0000-000000000002';
  IF v IS NULL THEN RAISE EXCEPTION 'FAIL T4: B did not receive E2'; END IF;
  IF v.sharer_contact_name IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T4: expected NULL attribution, got %', v.sharer_contact_name;
  END IF;
  RAISE NOTICE 'PASS T4: nameless sharer with no contact row leaves attribution NULL';
END $$;
COMMIT;

DO $$ BEGIN RAISE NOTICE 'ALL DISPLAY-NAME TESTS PASSED'; END $$;
