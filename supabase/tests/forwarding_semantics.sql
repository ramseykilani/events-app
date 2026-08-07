-- Functional test of forwarding semantics against the migrated scratch DB.
-- Impersonation: SET request.jwt.claim.sub to the user's uuid (auth.uid() reads it).

\set ON_ERROR_STOP on

-- Cast (fixed UUIDs)
-- users: A=...0001 B=...0002 C=...0003 D=...0004
-- event: E=eeeeeeee-...-0001  solo=eeeeeeee-...-0002
-- my_people: A->B ...0001, A->D ...0004, B->C ...0003, B->A ...0002, C->B ...0005, B->D ...0006, D->B ...0007

INSERT INTO auth.users (id, phone) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '+15555550100'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '+15555550101'),
  ('cccccccc-0000-0000-0000-000000000003', '+15555550102');
-- handle_new_auth_user trigger inserts public.users rows automatically

DO $$
BEGIN
  IF (SELECT count(*) FROM public.users) <> 3 THEN
    RAISE EXCEPTION 'FAIL: auth->public users trigger did not create rows';
  END IF;
END $$;

INSERT INTO public.my_people (id, owner_id, phone_number, contact_name) VALUES
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '+15555550101', 'Bee'),
  ('11111111-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '+15555550103', 'Dee'),
  ('22222222-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', '+15555550102', 'Cee'),
  ('22222222-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', '+15555550100', 'Ay'),
  ('33333333-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000003', '+15555550101', 'Bee');

-- B contacts resolve to existing app users immediately (BEFORE INSERT resolver)
DO $$
BEGIN
  IF (SELECT user_id FROM public.my_people WHERE id = '11111111-0000-0000-0000-000000000001') IS DISTINCT FROM 'bbbbbbbb-0000-0000-0000-000000000002'::uuid THEN
    RAISE EXCEPTION 'FAIL: contact user_id not resolved on insert';
  END IF;
  RAISE NOTICE 'PASS: contact user_id resolution on insert';
END $$;

-- A creates event E directly (find_or_create_event smoke-tested separately below)
INSERT INTO public.events (id, created_by_user_id, title, url, event_date, event_time) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Board Game Night', 'https://example.com/bgn', '2026-09-15', '19:00');
INSERT INTO public.user_events (id, user_id, event_id) VALUES
  ('deadbeef-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001');

-- ===== T1: A shares with B (app user) and D (no account) =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT public.share_event(
  'deadbeef-0000-0000-0000-00000000000a',
  ARRAY['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000004']::uuid[]
) AS t1_new_shares;
COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_events WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002' AND event_id = 'eeeeeeee-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T1: B did not receive own copy';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_events WHERE user_id = 'dddddddd-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 'FAIL T1: D got a copy before signup';
  END IF;
  IF (SELECT count(*) FROM public.event_shares) <> 2 THEN
    RAISE EXCEPTION 'FAIL T1: expected 2 event_shares, got %', (SELECT count(*) FROM public.event_shares);
  END IF;
  RAISE NOTICE 'PASS T1: share delivers copies to app users only';
END $$;

-- ===== T2: B re-shares to C =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
SELECT public.share_event(
  (SELECT id FROM public.user_events WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002' AND event_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  ARRAY['22222222-0000-0000-0000-000000000003']::uuid[]
) AS t2_new_shares;
COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_events WHERE user_id = 'cccccccc-0000-0000-0000-000000000003' AND event_id = 'eeeeeeee-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T2: C did not receive own copy';
  END IF;
  RAISE NOTICE 'PASS T2: re-share delivers C a copy';
END $$;

-- ===== T3: calendars + attribution =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events('bbbbbbbb-0000-0000-0000-000000000002', '2026-01-01', '2027-12-31');
  IF v IS NULL THEN RAISE EXCEPTION 'FAIL T3: B calendar empty'; END IF;
  IF v.sharer_contact_name IS DISTINCT FROM 'Ay' THEN
    RAISE EXCEPTION 'FAIL T3: B attribution expected Ay, got %', v.sharer_contact_name;
  END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events('cccccccc-0000-0000-0000-000000000003', '2026-01-01', '2027-12-31');
  IF v.sharer_contact_name IS DISTINCT FROM 'Bee' THEN
    RAISE EXCEPTION 'FAIL T3: C attribution expected Bee, got %', v.sharer_contact_name;
  END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-01', '2027-12-31');
  IF v IS NULL THEN RAISE EXCEPTION 'FAIL T3: A calendar empty'; END IF;
  IF v.sharer_contact_name IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T3: A is creator, expected null attribution, got %', v.sharer_contact_name;
  END IF;
  RAISE NOTICE 'PASS T3: calendars + attribution correct';
END $$;
COMMIT;

-- ===== T4: A removes own copy -> B and C keep theirs =====
DELETE FROM public.user_events WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_shares es JOIN public.user_events ue ON ue.id = es.user_event_id WHERE ue.user_id = 'aaaaaaaa-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T4: A share records should cascade with A copy';
  END IF;
END $$;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events('bbbbbbbb-0000-0000-0000-000000000002', '2026-01-01', '2027-12-31');
  IF v IS NULL THEN RAISE EXCEPTION 'FAIL T4: B lost the event after A removed it'; END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events('cccccccc-0000-0000-0000-000000000003', '2026-01-01', '2027-12-31');
  IF v IS NULL THEN RAISE EXCEPTION 'FAIL T4: C lost the event after A removed it'; END IF;
  IF v.sharer_contact_name IS DISTINCT FROM 'Bee' THEN
    RAISE EXCEPTION 'FAIL T4: C attribution should still be Bee, got %', v.sharer_contact_name;
  END IF;
  RAISE NOTICE 'PASS T4: A removal affects only A; B and C keep copies';
END $$;
COMMIT;

-- ===== T5: signup delivery for a pending share =====
-- D signs up now; A's share record to D was cascaded away in T4, so D gets no copy of E from A.
-- B shares E to D post-signup instead.
INSERT INTO auth.users (id, phone) VALUES ('dddddddd-0000-0000-0000-000000000004', '+15555550103');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.my_people WHERE owner_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND phone_number = '+15555550103' AND user_id = 'dddddddd-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 'FAIL T5a: D my_people.user_id not resolved on signup';
  END IF;
  RAISE NOTICE 'PASS T5a: signup resolves my_people.user_id';
END $$;

-- B adds D as contact (user_id resolves immediately) and shares
INSERT INTO public.my_people (id, owner_id, phone_number, contact_name) VALUES
  ('22222222-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-000000000002', '+15555550103', 'Dee');

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
SELECT public.share_event(
  (SELECT id FROM public.user_events WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002' AND event_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  ARRAY['22222222-0000-0000-0000-000000000006']::uuid[]
);
COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_events WHERE user_id = 'dddddddd-0000-0000-0000-000000000004' AND event_id = 'eeeeeeee-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T5b: D did not get copy when shared post-signup';
  END IF;
  RAISE NOTICE 'PASS T5b: share to newly-signed-up user delivers copy';
END $$;

-- T5c: true pending delivery — B creates another event and shares to E (no account), then E signs up
INSERT INTO public.events (id, created_by_user_id, title, event_date) VALUES
  ('eeeeeeee-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Picnic', '2026-10-01');
INSERT INTO public.user_events (id, user_id, event_id) VALUES
  ('deadbeef-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000002');
INSERT INTO public.my_people (id, owner_id, phone_number, contact_name) VALUES
  ('22222222-0000-0000-0000-000000000007', 'bbbbbbbb-0000-0000-0000-000000000002', '+15555550104', 'Ee (pending)');

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
SELECT public.share_event('deadbeef-0000-0000-0000-00000000000b', ARRAY['22222222-0000-0000-0000-000000000007']::uuid[]);
COMMIT;

INSERT INTO auth.users (id, phone) VALUES ('eeeeeeee-1000-0000-0000-000000000005', '+15555550104');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_events WHERE user_id = 'eeeeeeee-1000-0000-0000-000000000005' AND event_id = 'eeeeeeee-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL T5c: pending share not delivered on signup';
  END IF;
  RAISE NOTICE 'PASS T5c: pending share delivered as copy on signup';
END $$;

-- ===== T6: hide suppresses hidden-sourced events, unhide restores =====
INSERT INTO public.my_people (id, owner_id, phone_number, contact_name) VALUES
  ('44444444-0000-0000-0000-000000000007', 'dddddddd-0000-0000-0000-000000000004', '+15555550101', 'Bee');
INSERT INTO public.hidden_people (owner_id, person_id) VALUES
  ('dddddddd-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000007');

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_calendar_events('dddddddd-0000-0000-0000-000000000004', '2026-01-01', '2027-12-31')) THEN
    RAISE EXCEPTION 'FAIL T6: hidden sharer event still visible to D';
  END IF;
  RAISE NOTICE 'PASS T6: hide suppresses calendar entry';
END $$;
COMMIT;

DELETE FROM public.hidden_people WHERE owner_id = 'dddddddd-0000-0000-0000-000000000004';

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', true);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.get_calendar_events('dddddddd-0000-0000-0000-000000000004', '2026-01-01', '2027-12-31')) THEN
    RAISE EXCEPTION 'FAIL T6b: event did not reappear after unhide';
  END IF;
  RAISE NOTICE 'PASS T6b: unhide restores calendar entry';
END $$;
COMMIT;

-- ===== T7: authorization =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
DO $$
BEGIN
  PERFORM public.get_calendar_events('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-01', '2027-12-31');
  RAISE EXCEPTION 'FAIL T7a: IDOR — B read A calendar';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS T7a: IDOR blocked (%)', SQLERRM;
END $$;
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
DO $$
BEGIN
  -- C tries to share from B's user_event (not theirs)
  PERFORM public.share_event(
    (SELECT id FROM public.user_events WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002' AND event_id = 'eeeeeeee-0000-0000-0000-000000000001'),
    ARRAY['33333333-0000-0000-0000-000000000005']::uuid[]);
  RAISE EXCEPTION 'FAIL T7b: C shared from B user_event';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS T7b: share_event ownership enforced (%)', SQLERRM;
END $$;
COMMIT;

-- B tries to share to a person id not in B's contacts (A's contact row).
-- Foreign ids are ignored by design (filtered server-side, no row created).
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
SELECT public.share_event(
  'deadbeef-0000-0000-0000-00000000000b',
  ARRAY['11111111-0000-0000-0000-000000000001']::uuid[]) AS t7c_ignored;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_shares WHERE user_event_id = 'deadbeef-0000-0000-0000-00000000000b' AND person_id = '11111111-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T7c: share recorded for another user''s contact';
  END IF;
  RAISE NOTICE 'PASS T7c: foreign contact ids ignored';
END $$;
COMMIT;

-- ===== T8: cleanup reaps only orphan snapshots =====
DELETE FROM public.user_events WHERE event_id = 'eeeeeeee-0000-0000-0000-000000000001';
SELECT public.cleanup_old_events();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE id = 'eeeeeeee-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T8: orphan snapshot not reclaimed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = 'eeeeeeee-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL T8: owned snapshot was reclaimed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_events WHERE event_id = 'eeeeeeee-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL T8: cleanup deleted an owned copy';
  END IF;
  RAISE NOTICE 'PASS T8: cleanup reaps orphans only';
END $$;

-- ===== T9: find_or_create_event smoke test =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
DO $$
DECLARE v1 uuid; v2 uuid;
BEGIN
  v1 := public.find_or_create_event('Smoke', null, null, 'https://example.com/smoke', '2026-11-01', null);
  v2 := public.find_or_create_event('Smoke', null, null, 'https://example.com/smoke', '2026-11-01', null);
  IF v1 IS NULL OR v1 IS DISTINCT FROM v2 THEN
    RAISE EXCEPTION 'FAIL T9: find_or_create_event not idempotent';
  END IF;
  RAISE NOTICE 'PASS T9: find_or_create_event idempotent';
END $$;
COMMIT;

DO $$ BEGIN RAISE NOTICE 'ALL FORWARDING TESTS PASSED'; END $$;
