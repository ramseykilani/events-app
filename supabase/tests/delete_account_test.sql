-- Functional test of delete_my_account() against the migrated scratch DB.
-- Impersonation: SET request.jwt.claim.sub to the user's uuid (auth.uid() reads it).

\set ON_ERROR_STOP on

-- Cast (fixed UUIDs, 'da' prefix to stay clear of forwarding_semantics.sql)
-- users: A=da000000-...-000a (deletes their account)  B=da000000-...-000b (recipient)
--        A2=da000000-...-000c (A re-signing up with the same phone)
-- events: E=daeeeeee-...-0001 (created by A, shared to B)  S=daeeeeee-...-0002 (A solo)
--         E2=daeeeeee-...-0003 (created by B, shared to A's phone while deleted)
-- my_people: A->B da111111-...-0001, B->A da111111-...-0002, A->pending da111111-...-0003

INSERT INTO auth.users (id, phone) VALUES
  ('da000000-0000-0000-0000-00000000000a', '+15555550200'),
  ('da000000-0000-0000-0000-00000000000b', '+15555550201');
-- handle_new_auth_user trigger inserts public.users rows automatically

INSERT INTO public.my_people (id, owner_id, phone_number, contact_name) VALUES
  ('da111111-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-00000000000a', '+15555550201', 'Bee'),
  ('da111111-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-00000000000b', '+15555550200', 'Ay'),
  ('da111111-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-00000000000a', '+15555550202', 'Cee (pending)');

-- B's contact row resolves to A's account on insert (BEFORE INSERT resolver)
DO $$
BEGIN
  IF (SELECT user_id FROM public.my_people WHERE id = 'da111111-0000-0000-0000-000000000002')
     IS DISTINCT FROM 'da000000-0000-0000-0000-00000000000a'::uuid THEN
    RAISE EXCEPTION 'FAIL setup: B contact for A not resolved on insert';
  END IF;
END $$;

INSERT INTO public.events (id, created_by_user_id, title, event_date) VALUES
  ('daeeeeee-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-00000000000a', 'Album Release', '2026-09-20'),
  ('daeeeeee-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-00000000000a', 'Solo Hike', '2026-09-21');
INSERT INTO public.user_events (id, user_id, event_id) VALUES
  ('da0becef-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-00000000000a', 'daeeeeee-0000-0000-0000-000000000001'),
  ('da0becef-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-00000000000a', 'daeeeeee-0000-0000-0000-000000000002');

-- ===== T1: A shares E with B (app user) and a pending contact =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-00000000000a', true);
SELECT public.share_event(
  'da0becef-0000-0000-0000-000000000001',
  ARRAY['da111111-0000-0000-0000-000000000001','da111111-0000-0000-0000-000000000003']::uuid[]
);
COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_events WHERE user_id = 'da000000-0000-0000-0000-00000000000b' AND event_id = 'daeeeeee-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T1: B did not receive own copy';
  END IF;
  IF (SELECT count(*) FROM public.event_shares es JOIN public.user_events ue ON ue.id = es.user_event_id WHERE ue.user_id = 'da000000-0000-0000-0000-00000000000a') <> 2 THEN
    RAISE EXCEPTION 'FAIL T1: expected 2 share records from A';
  END IF;
  RAISE NOTICE 'PASS T1: share delivered B a copy and recorded 2 shares';
END $$;

-- ===== T2: unauthenticated calls are rejected =====
BEGIN;
DO $$
BEGIN
  PERFORM public.delete_my_account();
  RAISE EXCEPTION 'FAIL T2: unauthenticated delete_my_account succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS T2: unauthenticated call rejected (%)', SQLERRM;
END $$;
COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'da000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'FAIL T2: A was deleted by the unauthenticated call';
  END IF;
END $$;

-- ===== T3: A deletes their account =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-00000000000a', true);
SELECT public.delete_my_account();
COMMIT;

DO $$
BEGIN
  -- A's own data is gone
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = 'da000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'FAIL T3: auth.users row survived';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = 'da000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'FAIL T3: public.users row survived';
  END IF;
  IF EXISTS (SELECT 1 FROM public.my_people WHERE owner_id = 'da000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'FAIL T3: A my_people rows survived';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_events WHERE user_id = 'da000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'FAIL T3: A user_events rows survived';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_shares es JOIN public.user_events ue ON ue.id = es.user_event_id WHERE ue.user_id = 'da000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'FAIL T3: A share records survived';
  END IF;
  -- The pending contact row died with A, so its share record is gone too
  IF EXISTS (SELECT 1 FROM public.event_shares WHERE person_id = 'da111111-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'FAIL T3: share to pending contact survived';
  END IF;
  -- B keeps their copy of E; the snapshot survives with a NULL creator
  IF NOT EXISTS (SELECT 1 FROM public.user_events WHERE user_id = 'da000000-0000-0000-0000-00000000000b' AND event_id = 'daeeeeee-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T3: B lost their copy of E';
  END IF;
  IF (SELECT created_by_user_id FROM public.events WHERE id = 'daeeeeee-0000-0000-0000-000000000001') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T3: E created_by_user_id not SET NULL';
  END IF;
  -- A's solo snapshot has zero owners but is not deleted inline (cleanup reclaims it)
  IF (SELECT created_by_user_id FROM public.events WHERE id = 'daeeeeee-0000-0000-0000-000000000002') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T3: S created_by_user_id not SET NULL';
  END IF;
  -- B's contact row for A reverts to a pending phone-number contact
  IF (SELECT user_id FROM public.my_people WHERE id = 'da111111-0000-0000-0000-000000000002') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T3: B contact for A did not revert to pending';
  END IF;
  RAISE NOTICE 'PASS T3: account deleted; recipients keep copies; creator SET NULL';
END $$;

-- ===== T4: B's calendar keeps E; attribution disappears cleanly =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events('da000000-0000-0000-0000-00000000000b', '2026-01-01', '2027-12-31');
  IF v IS NULL THEN RAISE EXCEPTION 'FAIL T4: B calendar empty after A deletion'; END IF;
  IF v.event_id IS DISTINCT FROM 'daeeeeee-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'FAIL T4: unexpected event on B calendar: %', v.event_id;
  END IF;
  IF v.sharer_contact_name IS NOT NULL OR v.sharer_person_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T4: attribution should be gone, got % / %', v.sharer_contact_name, v.sharer_person_id;
  END IF;
  RAISE NOTICE 'PASS T4: B keeps E with no attribution';
END $$;
COMMIT;

-- ===== T5: cleanup reclaims the orphaned solo snapshot only =====
SELECT public.cleanup_old_events();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE id = 'daeeeeee-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL T5: orphaned solo snapshot not reclaimed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = 'daeeeeee-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T5: B-owned snapshot was reclaimed';
  END IF;
  RAISE NOTICE 'PASS T5: cleanup reclaims only the orphaned snapshot';
END $$;

-- ===== T6: re-signup starts clean and receives pending shares =====
-- B creates E2 and shares it to A's phone, which is a pending contact again.
INSERT INTO public.events (id, created_by_user_id, title, event_date) VALUES
  ('daeeeeee-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-00000000000b', 'Gallery Opening', '2026-10-05');
INSERT INTO public.user_events (id, user_id, event_id) VALUES
  ('da0becef-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-00000000000b', 'daeeeeee-0000-0000-0000-000000000003');

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-00000000000b', true);
SELECT public.share_event(
  'da0becef-0000-0000-0000-000000000003',
  ARRAY['da111111-0000-0000-0000-000000000002']::uuid[]
);
COMMIT;

-- A signs up again with the same phone number: fresh account, pending share delivered.
INSERT INTO auth.users (id, phone) VALUES
  ('da000000-0000-0000-0000-00000000000c', '+15555550200');

DO $$
BEGIN
  IF (SELECT user_id FROM public.my_people WHERE id = 'da111111-0000-0000-0000-000000000002')
     IS DISTINCT FROM 'da000000-0000-0000-0000-00000000000c'::uuid THEN
    RAISE EXCEPTION 'FAIL T6: B contact not re-resolved to the new account';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_events WHERE user_id = 'da000000-0000-0000-0000-00000000000c' AND event_id = 'daeeeeee-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'FAIL T6: pending share not delivered to re-signed-up account';
  END IF;
  -- The old account's copy of E and its share records died with it — nothing
  -- from the previous account is resurrected.
  IF EXISTS (SELECT 1 FROM public.user_events WHERE user_id = 'da000000-0000-0000-0000-00000000000c' AND event_id = 'daeeeeee-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T6: re-signed-up account inherited the old account''s events';
  END IF;
  RAISE NOTICE 'PASS T6: re-signup is a clean account with pending shares delivered';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL DELETE-ACCOUNT TESTS PASSED'; END $$;
