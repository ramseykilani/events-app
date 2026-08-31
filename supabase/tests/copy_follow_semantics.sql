-- Functional test of Copy + Follow semantics against the migrated scratch DB
-- (spec: docs/per-user-events-copy-follow-spec.md → Test plan).
-- Impersonation: SET request.jwt.claim.sub to the user's uuid (auth.uid() reads it).

\set ON_ERROR_STOP on

-- Cast (fixed UUIDs)
-- users: A=aaaaaaaa-...-0001 B=bbbbbbbb-...-0002 C=cccccccc-...-0003
--        D=dddddddd-...-0004 (signs up late)  E=eeeeeeee-1000-...-0005 (signs up late)
-- events (owner-scoped rows): E1 (A) eeeeeeee-...-0001, E2 (B) eeeeeeee-...-0002,
--        E3 (A) eeeeeeee-...-0003, Lunch-A eeeeeeee-...-0004, Lunch-B eeeeeeee-...-0005,
--        cycle rows X(A) eeeeeeee-...-0006, Y(B) eeeeeeee-...-0007, Z(C) eeeeeeee-...-0008
-- my_people: A->B ...0001, A->D ...0004, A->C ...0008, B->C ...0003, B->A ...0002,
--            C->B ...0005, B->E ...0007

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
  ('11111111-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', '+15555550102', 'Cee'),
  ('22222222-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', '+15555550102', 'Cee'),
  ('22222222-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', '+15555550100', 'Ay'),
  ('33333333-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000003', '+15555550101', 'Bee'),
  ('22222222-0000-0000-0000-000000000007', 'bbbbbbbb-0000-0000-0000-000000000002', '+15555550104', 'Ee (pending)');

-- Contacts for existing users resolve user_id immediately (BEFORE INSERT resolver)
DO $$
BEGIN
  IF (SELECT user_id FROM public.my_people WHERE id = '11111111-0000-0000-0000-000000000001') IS DISTINCT FROM 'bbbbbbbb-0000-0000-0000-000000000002'::uuid THEN
    RAISE EXCEPTION 'FAIL: contact user_id not resolved on insert';
  END IF;
  IF (SELECT user_id FROM public.my_people WHERE id = '11111111-0000-0000-0000-000000000004') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: pending contact should have NULL user_id';
  END IF;
  RAISE NOTICE 'PASS: contact user_id resolution on insert';
END $$;

-- The scratch DB has no Supabase default privileges, so grant the client
-- role what the real project grants; RLS then does the filtering. (T5 and T9
-- exercise the authenticated role.)
GRANT SELECT, DELETE ON public.events TO authenticated;
GRANT SELECT ON public.sends TO authenticated;

-- A creates event E1 via save_event with a client-generated id (as the client does)
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT public.save_event(
  'eeeeeeee-0000-0000-0000-000000000001',
  'https://example.com/bgn', 'Board Game Night', null, null, '2026-09-15', '19:00'
) AS t0_created;
COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = 'eeeeeeee-0000-0000-0000-000000000001'
                 AND owner_id = 'aaaaaaaa-0000-0000-0000-000000000001'
                 AND from_event_id IS NULL AND from_user_id IS NULL AND NOT frozen) THEN
    RAISE EXCEPTION 'FAIL T0: save_event did not create A''s row';
  END IF;
  RAISE NOTICE 'PASS T0: save_event creates an owned root row';
END $$;

-- ===== T1: A shares with B (app user) and D (no account) =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT public.share_event(
  'eeeeeeee-0000-0000-0000-000000000001',
  ARRAY['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000004']::uuid[]
) AS t1_new_sends;
COMMIT;

DO $$
DECLARE v_copy public.events;
BEGIN
  SELECT * INTO v_copy FROM public.events
  WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'
    AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000001';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL T1: B did not receive own copy';
  END IF;
  IF v_copy.from_user_id IS DISTINCT FROM 'aaaaaaaa-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'FAIL T1: B copy from_user_id expected A, got %', v_copy.from_user_id;
  END IF;
  IF v_copy.title IS DISTINCT FROM 'Board Game Night' OR v_copy.event_time IS DISTINCT FROM '19:00'::time THEN
    RAISE EXCEPTION 'FAIL T1: B copy fields do not match the sender row';
  END IF;
  IF EXISTS (SELECT 1 FROM public.events WHERE owner_id = 'dddddddd-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 'FAIL T1: D got a copy before signup';
  END IF;
  IF (SELECT count(*) FROM public.sends WHERE event_id = 'eeeeeeee-0000-0000-0000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'FAIL T1: expected 2 sends on A''s row, got %',
      (SELECT count(*) FROM public.sends WHERE event_id = 'eeeeeeee-0000-0000-0000-000000000001');
  END IF;
  RAISE NOTICE 'PASS T1: share delivers copies to app users only; sends recorded';
END $$;

-- Re-share from the same sender row to the same person cannot plant a second row
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT public.share_event(
  'eeeeeeee-0000-0000-0000-000000000001',
  ARRAY['11111111-0000-0000-0000-000000000001']::uuid[]
) AS t1b_new_sends;
COMMIT;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.events WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'FAIL T1b: duplicate delivery from the same sender row';
  END IF;
  RAISE NOTICE 'PASS T1b: re-share from the same sender row is a no-op for the recipient copy';
END $$;

-- ===== T2: re-share chain A->B->C — C's row follows B's row, not A's =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
SELECT public.share_event(
  (SELECT id FROM public.events WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'
   AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  ARRAY['22222222-0000-0000-0000-000000000003']::uuid[]
) AS t2_new_sends;
COMMIT;

DO $$
DECLARE
  v_b_row uuid;
  v_c_copy public.events;
BEGIN
  SELECT id INTO v_b_row FROM public.events
  WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'
    AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000001';
  SELECT * INTO v_c_copy FROM public.events
  WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL T2: C did not receive own copy';
  END IF;
  IF v_c_copy.from_event_id IS DISTINCT FROM v_b_row THEN
    RAISE EXCEPTION 'FAIL T2: C copy should follow B''s row %, got %', v_b_row, v_c_copy.from_event_id;
  END IF;
  IF v_c_copy.from_user_id IS DISTINCT FROM 'bbbbbbbb-0000-0000-0000-000000000002'::uuid THEN
    RAISE EXCEPTION 'FAIL T2: C copy from_user_id expected B, got %', v_c_copy.from_user_id;
  END IF;
  RAISE NOTICE 'PASS T2: re-share copies the re-sharer''s row; C follows B, not A';
END $$;

-- ===== T3: edit cascade depth >= 2 — A edits; B's and C's rows update =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT public.save_event(
  'eeeeeeee-0000-0000-0000-000000000001',
  'https://example.com/bgn', 'Board Game Night', null, null, '2026-09-15', '20:30'
);
COMMIT;

DO $$
BEGIN
  IF (SELECT event_time FROM public.events WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000001') IS DISTINCT FROM '20:30'::time THEN
    RAISE EXCEPTION 'FAIL T3: B''s row did not receive A''s edit';
  END IF;
  IF (SELECT event_time FROM public.events WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003') IS DISTINCT FROM '20:30'::time THEN
    RAISE EXCEPTION 'FAIL T3: C''s row did not receive A''s edit through B';
  END IF;
  IF (SELECT frozen FROM public.events WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T3: B''s row must keep following (frozen stayed false)';
  END IF;
  IF (SELECT frozen FROM public.events WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'FAIL T3: C''s row must keep following (frozen stayed false)';
  END IF;
  IF NOT (SELECT frozen FROM public.events WHERE id = 'eeeeeeee-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T3: A''s own row should be frozen after an edit (it follows nothing, but the flag is set)';
  END IF;
  RAISE NOTICE 'PASS T3: edit cascades two levels deep; followers keep following';
END $$;

-- ===== T6 (sequenced here): hide filters the calendar, not the cascade =====
-- B hides A: the row A sent disappears from B's calendar...
INSERT INTO public.hidden_people (owner_id, person_id) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002');

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_calendar_events('bbbbbbbb-0000-0000-0000-000000000002', '2026-01-01', '2027-12-31')) THEN
    RAISE EXCEPTION 'FAIL T6: hidden sharer event still visible to B';
  END IF;
  RAISE NOTICE 'PASS T6: hide suppresses the hidden sender''s row from the calendar';
END $$;
COMMIT;

-- ...but A's edit still lands on B's (hidden) row while hidden.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT public.save_event(
  'eeeeeeee-0000-0000-0000-000000000001',
  'https://example.com/bgn', 'Board Game Night', 'updated details', null, '2026-09-15', '20:30'
);
COMMIT;

DO $$
BEGIN
  IF (SELECT description FROM public.events WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000001') IS DISTINCT FROM 'updated details' THEN
    RAISE EXCEPTION 'FAIL T6b: cascade did not update the hidden row';
  END IF;
  RAISE NOTICE 'PASS T6b: cascades still update the hidden row while hidden';
END $$;

-- Unhide restores visibility with the corrections already applied.
DELETE FROM public.hidden_people WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002';

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events('bbbbbbbb-0000-0000-0000-000000000002', '2026-01-01', '2027-12-31');
  IF v IS NULL THEN RAISE EXCEPTION 'FAIL T6c: event did not reappear after unhide'; END IF;
  IF v.description IS DISTINCT FROM 'updated details' THEN
    RAISE EXCEPTION 'FAIL T6c: unhidden row should carry the cascaded correction, got %', v.description;
  END IF;
  IF v.sharer_contact_name IS DISTINCT FROM 'Ay' THEN
    RAISE EXCEPTION 'FAIL T6c: B attribution expected Ay, got %', v.sharer_contact_name;
  END IF;
  RAISE NOTICE 'PASS T6c: unhide restores visibility with corrections applied';
END $$;
COMMIT;

-- Attribution spot-checks (live join on from_user_id): C sees 'Bee' (C's
-- contact name for B); A's own row has NULL attribution and sharer_user_id
-- falls back to the caller.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events('cccccccc-0000-0000-0000-000000000003', '2026-01-01', '2027-12-31');
  IF v.sharer_contact_name IS DISTINCT FROM 'Bee' THEN
    RAISE EXCEPTION 'FAIL T6d: C attribution expected Bee, got %', v.sharer_contact_name;
  END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-01', '2027-12-31');
  IF v IS NULL THEN RAISE EXCEPTION 'FAIL T6e: A calendar empty'; END IF;
  IF v.sharer_contact_name IS NOT NULL OR v.sharer_person_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T6e: A is the creator, expected null attribution, got % / %', v.sharer_contact_name, v.sharer_person_id;
  END IF;
  IF v.sharer_user_id IS DISTINCT FROM 'aaaaaaaa-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'FAIL T6e: sharer_user_id should fall back to the caller, got %', v.sharer_user_id;
  END IF;
  RAISE NOTICE 'PASS T6d/e: attribution correct for recipient and creator';
END $$;
COMMIT;

-- ===== T4: frozen pruning — B edits; B stops following A; B's edit cascades
-- to C; A's later edit reaches neither B nor C =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
SELECT public.save_event(
  (SELECT id FROM public.events WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'
   AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'https://example.com/bgn', 'Board Game Night (B''s edition)', 'updated details', null, '2026-09-15', '20:30'
);
COMMIT;

DO $$
BEGIN
  IF NOT (SELECT frozen FROM public.events WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'
          AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T4: B''s edit did not freeze B''s row';
  END IF;
  IF (SELECT title FROM public.events WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003') IS DISTINCT FROM 'Board Game Night (B''s edition)' THEN
    RAISE EXCEPTION 'FAIL T4: B''s edit did not cascade to C';
  END IF;
  RAISE NOTICE 'PASS T4a: B''s edit freezes B and cascades to C';
END $$;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT public.save_event(
  'eeeeeeee-0000-0000-0000-000000000001',
  'https://example.com/bgn', 'Board Game Night', 'updated details', null, '2026-09-15', '21:00'
);
COMMIT;

DO $$
BEGIN
  IF (SELECT event_time FROM public.events WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000001') IS DISTINCT FROM '20:30'::time THEN
    RAISE EXCEPTION 'FAIL T4b: A''s later edit reached frozen B';
  END IF;
  IF (SELECT event_time FROM public.events WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003') IS DISTINCT FROM '20:30'::time THEN
    RAISE EXCEPTION 'FAIL T4b: A''s later edit reached C through frozen B';
  END IF;
  IF (SELECT title FROM public.events WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003') IS DISTINCT FROM 'Board Game Night (B''s edition)' THEN
    RAISE EXCEPTION 'FAIL T4b: C should keep B''s version';
  END IF;
  RAISE NOTICE 'PASS T4b: a frozen intermediary prunes its whole subtree from the cascade';
END $$;

-- ===== T5: remove — A deletes their row; B/C keep theirs; the follow link
-- clears; the sends on A's row cascade =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
DELETE FROM public.events WHERE id = 'eeeeeeee-0000-0000-0000-000000000001';
COMMIT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE id = 'eeeeeeee-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T5: A''s row was not deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sends WHERE event_id = 'eeeeeeee-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T5: sends on A''s row should cascade with it';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'
                 AND title = 'Board Game Night (B''s edition)') THEN
    RAISE EXCEPTION 'FAIL T5: B lost their row when A removed theirs';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'FAIL T5: C lost their row when A removed theirs';
  END IF;
  IF (SELECT from_event_id FROM public.events WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      AND title = 'Board Game Night (B''s edition)') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T5: B''s from_event_id should be SET NULL after A''s row went away';
  END IF;
  -- from_user_id stays (A's account still exists) — only the row link cleared.
  IF (SELECT from_user_id FROM public.events WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002'
      AND title = 'Board Game Night (B''s edition)') IS DISTINCT FROM 'aaaaaaaa-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'FAIL T5: B''s from_user_id should still be A (the account exists)';
  END IF;
  RAISE NOTICE 'PASS T5: remove is personal; followers keep their rows; the follow link clears';
END $$;

-- T5b: the sender removed their row before the pending recipient signed up —
-- the sends line cascaded with it, so D's signup delivers nothing.
INSERT INTO auth.users (id, phone) VALUES ('dddddddd-0000-0000-0000-000000000004', '+15555550103');

DO $$
BEGIN
  IF (SELECT user_id FROM public.my_people WHERE id = '11111111-0000-0000-0000-000000000004')
     IS DISTINCT FROM 'dddddddd-0000-0000-0000-000000000004'::uuid THEN
    RAISE EXCEPTION 'FAIL T5b: D my_people.user_id not resolved on signup';
  END IF;
  IF EXISTS (SELECT 1 FROM public.events WHERE owner_id = 'dddddddd-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 'FAIL T5b: D received a copy whose sends line had cascaded away';
  END IF;
  RAISE NOTICE 'PASS T5b: a cascaded sends line delivers nothing at sign-up';
END $$;

-- ===== T7: two senders, same listing — two rows, each following its own
-- sender (no cross-sender dedup; no global dedup either) =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT public.save_event('eeeeeeee-0000-0000-0000-000000000004', null, 'Lunch', null, null, '2026-10-02', '12:30');
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
SELECT public.save_event('eeeeeeee-0000-0000-0000-000000000005', null, 'Lunch', null, null, '2026-10-02', '12:30');
COMMIT;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.events WHERE title = 'Lunch' AND event_date = '2026-10-02') <> 2 THEN
    RAISE EXCEPTION 'FAIL T7: identical listings from two users should be two independent rows (KI-002)';
  END IF;
  RAISE NOTICE 'PASS T7a: no global dedup — two people adding Lunch are two rows';
END $$;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT public.share_event('eeeeeeee-0000-0000-0000-000000000004', ARRAY['11111111-0000-0000-0000-000000000008']::uuid[]);
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
SELECT public.share_event('eeeeeeee-0000-0000-0000-000000000005', ARRAY['22222222-0000-0000-0000-000000000003']::uuid[]);
COMMIT;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.events WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003'
      AND title = 'Lunch' AND event_date = '2026-10-02') <> 2 THEN
    RAISE EXCEPTION 'FAIL T7b: C should have two rows for the same listing from two senders';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003'
                 AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000004'
                 AND from_user_id = 'aaaaaaaa-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T7b: C''s row from A missing or mislinked';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003'
                 AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000005'
                 AND from_user_id = 'bbbbbbbb-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL T7b: C''s row from B missing or mislinked';
  END IF;
  RAISE NOTICE 'PASS T7b: two senders deliver two rows, each following its own sender';
END $$;

-- Each copy follows only its own sender: A's edit reaches C's A-copy only.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT public.save_event('eeeeeeee-0000-0000-0000-000000000004', null, 'Lunch', null, null, '2026-10-02', '13:00');
COMMIT;

DO $$
BEGIN
  IF (SELECT event_time FROM public.events WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003'
      AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000004') IS DISTINCT FROM '13:00'::time THEN
    RAISE EXCEPTION 'FAIL T7c: A''s edit did not reach C''s A-copy';
  END IF;
  IF (SELECT event_time FROM public.events WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003'
      AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000005') IS DISTINCT FROM '12:30'::time THEN
    RAISE EXCEPTION 'FAIL T7c: A''s edit leaked into C''s B-copy';
  END IF;
  RAISE NOTICE 'PASS T7c: each copy follows only its own sender';
END $$;

-- ===== T8: pending delivery stamps the sender's CURRENT values at sign-up
-- (share to a non-account, edit after sharing, then sign up) =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
SELECT public.save_event('eeeeeeee-0000-0000-0000-000000000002', null, 'Picnic', null, null, '2026-10-01', null);
SELECT public.share_event('eeeeeeee-0000-0000-0000-000000000002', ARRAY['22222222-0000-0000-0000-000000000007']::uuid[]);
COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sends WHERE event_id = 'eeeeeeee-0000-0000-0000-000000000002'
                 AND person_id = '22222222-0000-0000-0000-000000000007') THEN
    RAISE EXCEPTION 'FAIL T8: pending send not recorded';
  END IF;
  IF EXISTS (SELECT 1 FROM public.events WHERE from_event_id = 'eeeeeeee-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL T8: a copy exists before the recipient signed up';
  END IF;
END $$;

-- B edits after sharing (pre-sign-up): the edit is simply included.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
SELECT public.save_event('eeeeeeee-0000-0000-0000-000000000002', null, 'Picnic (moved indoors)', null, null, '2026-10-01', '18:00');
COMMIT;

INSERT INTO auth.users (id, phone) VALUES ('eeeeeeee-1000-0000-0000-000000000005', '+15555550104');

DO $$
DECLARE v_copy public.events;
BEGIN
  SELECT * INTO v_copy FROM public.events WHERE owner_id = 'eeeeeeee-1000-0000-0000-000000000005';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL T8: pending share not delivered on signup';
  END IF;
  IF v_copy.title IS DISTINCT FROM 'Picnic (moved indoors)' OR v_copy.event_time IS DISTINCT FROM '18:00'::time THEN
    RAISE EXCEPTION 'FAIL T8: pending copy should carry the post-edit values, got % / %', v_copy.title, v_copy.event_time;
  END IF;
  IF v_copy.from_event_id IS DISTINCT FROM 'eeeeeeee-0000-0000-0000-000000000002'::uuid
     OR v_copy.from_user_id IS DISTINCT FROM 'bbbbbbbb-0000-0000-0000-000000000002'::uuid THEN
    RAISE EXCEPTION 'FAIL T8: pending copy follow links wrong: % / %', v_copy.from_event_id, v_copy.from_user_id;
  END IF;
  RAISE NOTICE 'PASS T8: pending delivery stamps the sender''s current values at sign-up';
END $$;

-- ===== T9: IDOR / authorization =====
-- T9a: RLS — a signed-in user cannot read another user's rows.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE owner_id <> 'bbbbbbbb-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL T9a: RLS let B read another user''s events';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE owner_id = 'bbbbbbbb-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL T9a: RLS hid B''s own rows';
  END IF;
  RAISE NOTICE 'PASS T9a: RLS restricts events reads to own rows';
END $$;
COMMIT;

-- T9a2: RLS — cannot delete another user's row (silently affects 0 rows).
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
DELETE FROM public.events WHERE id = 'eeeeeeee-0000-0000-0000-000000000004';
COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = 'eeeeeeee-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 'FAIL T9a2: B deleted A''s row';
  END IF;
  RAISE NOTICE 'PASS T9a2: RLS blocks cross-user deletes';
END $$;

-- T9b: save_event on a row you don't own raises.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
DO $$
BEGIN
  PERFORM public.save_event('eeeeeeee-0000-0000-0000-000000000005', null, 'Hijacked', null, null, '2026-10-02', '12:30');
  RAISE EXCEPTION 'FAIL T9b: C saved over B''s row';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS T9b: save_event ownership enforced (%)', SQLERRM;
END $$;
COMMIT;

-- T9c: share_event on a row you don't own raises.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
DO $$
BEGIN
  PERFORM public.share_event('eeeeeeee-0000-0000-0000-000000000005', ARRAY['33333333-0000-0000-0000-000000000005']::uuid[]);
  RAISE EXCEPTION 'FAIL T9c: C shared from B''s row';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS T9c: share_event ownership enforced (%)', SQLERRM;
END $$;
COMMIT;

-- T9d: sends cannot be recorded against another user's contacts (foreign ids
-- are filtered server-side, no row created).
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
SELECT public.share_event('eeeeeeee-0000-0000-0000-000000000005', ARRAY['11111111-0000-0000-0000-000000000001']::uuid[]) AS t9d_ignored;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sends WHERE event_id = 'eeeeeeee-0000-0000-0000-000000000005'
             AND person_id = '11111111-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL T9d: send recorded for another user''s contact';
  END IF;
  RAISE NOTICE 'PASS T9d: foreign contact ids ignored';
END $$;
COMMIT;

-- T9e: calendar IDOR — B cannot read A's calendar.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
DO $$
BEGIN
  PERFORM public.get_calendar_events('aaaaaaaa-0000-0000-0000-000000000001', '2026-01-01', '2027-12-31');
  RAISE EXCEPTION 'FAIL T9e: IDOR — B read A calendar';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS T9e: calendar IDOR blocked (%)', SQLERRM;
END $$;
COMMIT;

-- T9f: unauthenticated calls are rejected.
DO $$
BEGIN
  PERFORM public.save_event('eeeeeeee-0000-0000-0000-0000000000aa', null, 'Anon', null, null, '2026-11-01', null);
  RAISE EXCEPTION 'FAIL T9f: unauthenticated save_event succeeded';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  RAISE NOTICE 'PASS T9f: unauthenticated save_event rejected (%)', SQLERRM;
END $$;

-- ===== T10: no-op save does not freeze (fields unchanged -> still following
-- -> a later sender edit still lands) =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT public.save_event('eeeeeeee-0000-0000-0000-000000000003', null, 'Museum', null, null, '2026-11-20', '14:00');
SELECT public.share_event('eeeeeeee-0000-0000-0000-000000000003', ARRAY['11111111-0000-0000-0000-000000000008']::uuid[]);
COMMIT;

-- C saves with unchanged values (the server-side no-op rule; the client
-- never even calls save_event in this case — this is defense in depth).
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
SELECT public.save_event(
  (SELECT id FROM public.events WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003'
   AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000003'),
  null, 'Museum', null, null, '2026-11-20', '14:00'
);
COMMIT;

DO $$
BEGIN
  IF (SELECT frozen FROM public.events WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003'
      AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'FAIL T10: a no-op save froze C''s row';
  END IF;
  RAISE NOTICE 'PASS T10a: no-op save does not end following';
END $$;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT public.save_event('eeeeeeee-0000-0000-0000-000000000003', null, 'Museum', null, null, '2026-11-20', '15:00');
COMMIT;

DO $$
BEGIN
  IF (SELECT event_time FROM public.events WHERE owner_id = 'cccccccc-0000-0000-0000-000000000003'
      AND from_event_id = 'eeeeeeee-0000-0000-0000-000000000003') IS DISTINCT FROM '15:00'::time THEN
    RAISE EXCEPTION 'FAIL T10b: A''s edit did not reach C after C''s no-op save';
  END IF;
  RAISE NOTICE 'PASS T10b: a later sender edit still lands after a no-op save';
END $$;

-- ===== T11: cycle safety — a hand-crafted follow loop terminates and each
-- row updates at most once =====
-- Rows: X (A) follows Z, Y (B) follows X, Z (C) follows Y — a 3-cycle,
-- impossible through the client (follow pointers are write-once at copy
-- creation); crafted here as definer to prove the cascade terminates.
INSERT INTO public.events (id, owner_id, title, event_date, from_event_id) VALUES
  ('eeeeeeee-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'Loop', '2026-12-01', 'eeeeeeee-0000-0000-0000-000000000008'),
  ('eeeeeeee-0000-0000-0000-000000000007', 'bbbbbbbb-0000-0000-0000-000000000002', 'Loop', '2026-12-01', 'eeeeeeee-0000-0000-0000-000000000006'),
  ('eeeeeeee-0000-0000-0000-000000000008', 'cccccccc-0000-0000-0000-000000000003', 'Loop', '2026-12-01', 'eeeeeeee-0000-0000-0000-000000000007');

-- Count row updates during the save below.
CREATE TEMP TABLE _update_counts (id uuid PRIMARY KEY, n integer NOT NULL);
CREATE OR REPLACE FUNCTION public._count_event_updates()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO _update_counts VALUES (NEW.id, 1)
  ON CONFLICT (id) DO UPDATE SET n = _update_counts.n + 1;
  RETURN NEW;
END;
$$;
CREATE TRIGGER _count_updates
  AFTER UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public._count_event_updates();

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT public.save_event('eeeeeeee-0000-0000-0000-000000000006', null, 'Loop (edited)', null, null, '2026-12-01', '10:00');
COMMIT;

DROP TRIGGER _count_updates ON public.events;
DROP FUNCTION public._count_event_updates();

DO $$
BEGIN
  IF (SELECT count(*) FROM public.events WHERE title = 'Loop (edited)') <> 3 THEN
    RAISE EXCEPTION 'FAIL T11: cascade through a cycle did not reach every row exactly once (titles: %)',
      (SELECT string_agg(title, ',') FROM public.events WHERE id IN (
        'eeeeeeee-0000-0000-0000-000000000006','eeeeeeee-0000-0000-0000-000000000007','eeeeeeee-0000-0000-0000-000000000008'));
  END IF;
  IF EXISTS (SELECT 1 FROM _update_counts WHERE n <> 1) THEN
    RAISE EXCEPTION 'FAIL T11: a row was updated more than once: %',
      (SELECT string_agg(id::text || '=' || n, ',') FROM _update_counts WHERE n <> 1);
  END IF;
  IF (SELECT count(*) FROM _update_counts) <> 3 THEN
    RAISE EXCEPTION 'FAIL T11: expected 3 updated rows, got %', (SELECT count(*) FROM _update_counts);
  END IF;
  RAISE NOTICE 'PASS T11: cycle terminates; each row updates at most once';
END $$;

-- ===== T12: save_event create-retry is side-effect-free (idempotency) =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
SELECT public.save_event('eeeeeeee-0000-0000-0000-000000000009', null, 'Retry Me', null, null, '2026-12-05', null);
-- A retry of the same aborted create finds the row and no-ops.
SELECT public.save_event('eeeeeeee-0000-0000-0000-000000000009', null, 'Retry Me', null, null, '2026-12-05', null);
COMMIT;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.events WHERE id = 'eeeeeeee-0000-0000-0000-000000000009') <> 1 THEN
    RAISE EXCEPTION 'FAIL T12: create retry double-created';
  END IF;
  IF (SELECT frozen FROM public.events WHERE id = 'eeeeeeee-0000-0000-0000-000000000009') THEN
    RAISE EXCEPTION 'FAIL T12: create retry froze the row';
  END IF;
  RAISE NOTICE 'PASS T12: create retry with the same id is a no-op';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL COPY+FOLLOW TESTS PASSED'; END $$;
