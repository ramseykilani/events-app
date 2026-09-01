-- Functional test of Archive Received Events (FEATURES.md, 2026-09-01):
-- archiving a received event is reversible; delete stays for self-created.
-- Covers the archived_at default, the set_event_archived guards and
-- idempotency, calendar exclusion, the follow cascade landing on archived
-- rows, drawer ordering/attribution/hide behavior, owner scoping, and
-- survival of the sender deleting their row.
-- Impersonation: SET request.jwt.claim.sub (auth.uid() reads it).

\set ON_ERROR_STOP on

-- Cast (fixed UUIDs, 'ae' prefix to stay clear of the other suites)
-- users: A=ae000000-...-000a  B=ae000000-...-000b
-- events (A's rows): E1..E4 = ae000000-...-00e1..00e4; B's copies get
--         generated ids (looked up where needed)
-- my_people: A->B ae000000-...-00c1, B->A ae000000-...-00c2
-- Dates pin around p_today '2026-10-10': E1 10-12 (upcoming near),
-- E2 10-15 (upcoming far), E3 10-08 (past recent), E4 10-05 (past old).

INSERT INTO auth.users (id, phone) VALUES
  ('ae000000-0000-0000-0000-00000000000a', '+15555550430'),
  ('ae000000-0000-0000-0000-00000000000b', '+15555550431');
-- handle_new_auth_user trigger inserts public.users rows automatically

UPDATE public.users SET display_name = 'Arch Alice'
  WHERE id = 'ae000000-0000-0000-0000-00000000000a';

INSERT INTO public.my_people (id, owner_id, phone_number, contact_name) VALUES
  ('ae000000-0000-0000-0000-0000000000c1', 'ae000000-0000-0000-0000-00000000000a', '+15555550431', 'Bee'),
  ('ae000000-0000-0000-0000-0000000000c2', 'ae000000-0000-0000-0000-00000000000b', '+15555550430', 'Ay');

-- The scratch DB has no Supabase default privileges; grant what the real
-- project grants so the SET LOCAL ROLE checks exercise RLS, not missing
-- grants.
GRANT SELECT, DELETE ON public.events TO authenticated;

-- A creates four events and shares them all to B.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000a', true);
SELECT public.save_event('ae000000-0000-0000-0000-0000000000e1', null, 'Archive E1', null, null, '2026-10-12', null);
SELECT public.save_event('ae000000-0000-0000-0000-0000000000e2', null, 'Archive E2', null, null, '2026-10-15', null);
SELECT public.save_event('ae000000-0000-0000-0000-0000000000e3', null, 'Archive E3', null, null, '2026-10-08', null);
SELECT public.save_event('ae000000-0000-0000-0000-0000000000e4', null, 'Archive E4', null, null, '2026-10-05', null);
SELECT public.share_event(
  'ae000000-0000-0000-0000-0000000000e1', ARRAY['ae000000-0000-0000-0000-0000000000c1']::uuid[]);
SELECT public.share_event(
  'ae000000-0000-0000-0000-0000000000e2', ARRAY['ae000000-0000-0000-0000-0000000000c1']::uuid[]);
SELECT public.share_event(
  'ae000000-0000-0000-0000-0000000000e3', ARRAY['ae000000-0000-0000-0000-0000000000c1']::uuid[]);
SELECT public.share_event(
  'ae000000-0000-0000-0000-0000000000e4', ARRAY['ae000000-0000-0000-0000-0000000000c1']::uuid[]);
COMMIT;

-- ===== T0: fresh rows are unarchived; the calendar exposes from_user_id =====
-- (Counts are scoped to this cast — the suite shares one database across
-- test files.)
DO $$
DECLARE v_unarchived integer; v record;
BEGIN
  SELECT count(*) INTO v_unarchived FROM public.events
    WHERE archived_at IS NULL
      AND owner_id IN ('ae000000-0000-0000-0000-00000000000a', 'ae000000-0000-0000-0000-00000000000b');
  IF v_unarchived <> 8 THEN
    RAISE EXCEPTION 'FAIL T0: expected 8 unarchived rows, got %', v_unarchived;
  END IF;
  RAISE NOTICE 'PASS T0: archived_at defaults NULL on every row';
END $$;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events(
    'ae000000-0000-0000-0000-00000000000b', '2026-01-01', '2027-12-31')
    WHERE title = 'Archive E1';
  IF v IS NULL THEN RAISE EXCEPTION 'FAIL T0b: B did not receive E1'; END IF;
  IF v.from_user_id IS DISTINCT FROM 'ae000000-0000-0000-0000-00000000000a' THEN
    RAISE EXCEPTION 'FAIL T0b: B copy from_user_id expected A, got %', v.from_user_id;
  END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000a', true);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_calendar_events(
    'ae000000-0000-0000-0000-00000000000a', '2026-01-01', '2027-12-31')
    WHERE title = 'Archive E1';
  IF v.from_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T0c: A created E1, expected NULL from_user_id, got %', v.from_user_id;
  END IF;
  RAISE NOTICE 'PASS T0b/c: calendar from_user_id classifies received vs self-created';
END $$;
COMMIT;

-- ===== T1: unauthenticated archive is rejected =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.set_event_archived('ae000000-0000-0000-0000-0000000000e1', true);
  EXCEPTION WHEN raise_exception THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'FAIL T1: anonymous archived an event';
  END IF;
  RAISE NOTICE 'PASS T1: unauthenticated set_event_archived rejected';
END $$;
COMMIT;

-- ===== T1b: unauthenticated drawer read is rejected =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.get_archived_events('2026-10-10');
  EXCEPTION WHEN raise_exception THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'FAIL T1b: anonymous read the archive drawer';
  END IF;
  RAISE NOTICE 'PASS T1b: unauthenticated get_archived_events rejected';
END $$;
COMMIT;

-- ===== T2: you cannot archive someone else's row =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.set_event_archived('ae000000-0000-0000-0000-0000000000e1', true);
  EXCEPTION WHEN raise_exception THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'FAIL T2: B archived A''s row';
  END IF;
  RAISE NOTICE 'PASS T2: non-owner set_event_archived rejected';
END $$;
COMMIT;

-- ===== T3: archive removes the row from the calendar into the drawer =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v_copy uuid; v_count integer; v record;
BEGIN
  SELECT id INTO v_copy FROM public.events
    WHERE owner_id = 'ae000000-0000-0000-0000-00000000000b'
      AND from_event_id = 'ae000000-0000-0000-0000-0000000000e1';
  PERFORM public.set_event_archived(v_copy, true);

  SELECT count(*) INTO v_count FROM public.get_calendar_events(
    'ae000000-0000-0000-0000-00000000000b', '2026-01-01', '2027-12-31');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'FAIL T3: archived row still on calendar (% of 3 remain)', v_count;
  END IF;

  SELECT * INTO v FROM public.get_archived_events('2026-10-10');
  IF v IS NULL THEN RAISE EXCEPTION 'FAIL T3: archived row missing from drawer'; END IF;
  IF v.title IS DISTINCT FROM 'Archive E1' THEN
    RAISE EXCEPTION 'FAIL T3: wrong drawer row, got %', v.title;
  END IF;
  IF v.sharer_contact_name IS DISTINCT FROM 'Ay' THEN
    RAISE EXCEPTION 'FAIL T3: drawer attribution expected Ay, got %', v.sharer_contact_name;
  END IF;
  IF v.from_user_id IS DISTINCT FROM 'ae000000-0000-0000-0000-00000000000a'
     OR v.archived_at IS NULL THEN
    RAISE EXCEPTION 'FAIL T3: drawer row missing provenance/archived_at';
  END IF;
  RAISE NOTICE 'PASS T3: archive moves the row from calendar to drawer with attribution';
END $$;
COMMIT;

-- ===== T4: re-archive is a no-op (the first archived_at stands) =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v_copy uuid; v_before timestamptz; v_after timestamptz;
BEGIN
  SELECT id, archived_at INTO v_copy, v_before FROM public.events
    WHERE owner_id = 'ae000000-0000-0000-0000-00000000000b'
      AND from_event_id = 'ae000000-0000-0000-0000-0000000000e1';
  -- A separate transaction = a later now(): a rewrite would be visible.
  PERFORM public.set_event_archived(v_copy, true);
  SELECT archived_at INTO v_after FROM public.events WHERE id = v_copy;
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'FAIL T4: re-archive rewrote archived_at (% -> %)', v_before, v_after;
  END IF;
  RAISE NOTICE 'PASS T4: re-archive is an idempotent no-op';
END $$;
COMMIT;

-- ===== T5: an archived row keeps following — the sender's edit lands =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000a', true);
SELECT public.save_event('ae000000-0000-0000-0000-0000000000e1', null, 'Archive E1 edited', null, null, '2026-10-12', null);
COMMIT;

DO $$
DECLARE v record;
BEGIN
  SELECT title, archived_at INTO v FROM public.events
    WHERE owner_id = 'ae000000-0000-0000-0000-00000000000b'
      AND from_event_id = 'ae000000-0000-0000-0000-0000000000e1';
  IF v.title IS DISTINCT FROM 'Archive E1 edited' THEN
    RAISE EXCEPTION 'FAIL T5: cascade missed the archived copy, got %', v.title;
  END IF;
  IF v.archived_at IS NULL THEN
    RAISE EXCEPTION 'FAIL T5b: save_event cleared archived_at';
  END IF;
  RAISE NOTICE 'PASS T5: sender edit cascades onto the archived follower (archive survives save_event)';
END $$;

-- ===== T6: restore returns the row to the calendar; re-restore is a no-op =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v_copy uuid; v record;
BEGIN
  SELECT id INTO v_copy FROM public.events
    WHERE owner_id = 'ae000000-0000-0000-0000-00000000000b'
      AND from_event_id = 'ae000000-0000-0000-0000-0000000000e1';
  PERFORM public.set_event_archived(v_copy, false);
  PERFORM public.set_event_archived(v_copy, false); -- idempotent no-op

  SELECT * INTO v FROM public.get_calendar_events(
    'ae000000-0000-0000-0000-00000000000b', '2026-01-01', '2027-12-31')
    WHERE title = 'Archive E1 edited';
  IF v IS NULL THEN RAISE EXCEPTION 'FAIL T6: restored row not back on calendar'; END IF;
  IF (SELECT archived_at FROM public.events WHERE id = v_copy) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T6: restored row still carries archived_at';
  END IF;
  IF (SELECT count(*) FROM public.get_archived_events('2026-10-10')) <> 0 THEN
    RAISE EXCEPTION 'FAIL T6: restored row still in drawer';
  END IF;
  RAISE NOTICE 'PASS T6: restore returns the row (with cascaded edits) to the calendar';
END $$;
COMMIT;

-- ===== T7: drawer ordering — upcoming nearest-first, then past recent-first =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v_titles text[];
BEGIN
  PERFORM public.set_event_archived(e.id, true) FROM public.events e
    WHERE e.owner_id = 'ae000000-0000-0000-0000-00000000000b';
  SELECT array_agg(t.title ORDER BY t.ordinality) INTO v_titles
    FROM public.get_archived_events('2026-10-10') WITH ORDINALITY t;
  IF v_titles <> ARRAY['Archive E1 edited', 'Archive E2', 'Archive E3', 'Archive E4'] THEN
    RAISE EXCEPTION 'FAIL T7: drawer order wrong, got %', v_titles;
  END IF;
  RAISE NOTICE 'PASS T7: drawer orders upcoming ascending, then past descending';
END $$;
COMMIT;

-- ===== T8: hide filters the calendar, not the drawer =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000b', true);
INSERT INTO public.hidden_people (owner_id, person_id)
  VALUES ('ae000000-0000-0000-0000-00000000000b', 'ae000000-0000-0000-0000-0000000000c2');
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.get_archived_events('2026-10-10');
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'FAIL T8: hidden sender''s archived rows missing from drawer (%)', v_count;
  END IF;
  RAISE NOTICE 'PASS T8: the drawer ignores hide';
END $$;
COMMIT;

-- ===== T9: the drawer is owner-scoped =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000a', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_archived_events('2026-10-10')) <> 0 THEN
    RAISE EXCEPTION 'FAIL T9: A sees archived rows — A archived nothing';
  END IF;
  RAISE NOTICE 'PASS T9: drawer returns only the caller''s archived rows';
END $$;
COMMIT;

-- ===== T10: the sender deleting their row strands nothing =====
-- (Unhide first: T8's hide would otherwise correctly filter the restored
-- row from the calendar — hide is unrelated to what this test pins.)
DELETE FROM public.hidden_people
  WHERE owner_id = 'ae000000-0000-0000-0000-00000000000b';

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000a', true);
DELETE FROM public.events WHERE id = 'ae000000-0000-0000-0000-0000000000e1';
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v record; v_copy uuid;
BEGIN
  -- from_event_id went SET NULL; from_user_id survives (attribution intact),
  -- so the copy still classifies as received and stays restorable.
  SELECT * INTO v FROM public.get_archived_events('2026-10-10')
    WHERE title = 'Archive E1 edited';
  IF v IS NULL THEN RAISE EXCEPTION 'FAIL T10: archived copy died with the sender row'; END IF;
  IF v.from_user_id IS DISTINCT FROM 'ae000000-0000-0000-0000-00000000000a' THEN
    RAISE EXCEPTION 'FAIL T10: from_user_id should survive sender delete, got %', v.from_user_id;
  END IF;
  IF v.sharer_contact_name IS DISTINCT FROM 'Ay' THEN
    RAISE EXCEPTION 'FAIL T10: attribution lost after sender delete, got %', v.sharer_contact_name;
  END IF;

  SELECT id INTO v_copy FROM public.events
    WHERE owner_id = 'ae000000-0000-0000-0000-00000000000b'
      AND title = 'Archive E1 edited';
  PERFORM public.set_event_archived(v_copy, false);
  IF NOT EXISTS (
    SELECT 1 FROM public.get_calendar_events(
      'ae000000-0000-0000-0000-00000000000b', '2026-01-01', '2027-12-31')
    WHERE title = 'Archive E1 edited'
  ) THEN
    RAISE EXCEPTION 'FAIL T10: sender-removed copy not restorable to calendar';
  END IF;
  RAISE NOTICE 'PASS T10: sender delete keeps the archived copy restorable with attribution';
END $$;
COMMIT;

-- ===== T11: archiving a nonexistent id reports not-yours =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.set_event_archived('ae000000-0000-0000-0000-00000000dead', true);
  EXCEPTION WHEN raise_exception THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'FAIL T11: archiving a nonexistent id succeeded';
  END IF;
  RAISE NOTICE 'PASS T11: nonexistent id rejected as not-your-event';
END $$;
COMMIT;

-- ===== T12: RLS — the owner reads their archived row directly (detail load) =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000b', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.events
    WHERE owner_id = 'ae000000-0000-0000-0000-00000000000b'
      AND archived_at IS NOT NULL;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'FAIL T12: owner cannot directly read archived rows (%)', v_count;
  END IF;
  -- Another user's rows stay invisible, archived or not.
  SELECT count(*) INTO v_count FROM public.events
    WHERE owner_id = 'ae000000-0000-0000-0000-00000000000a';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL T12: B read % of A''s rows directly', v_count;
  END IF;
  RAISE NOTICE 'PASS T12: owner-only SELECT covers archived rows';
END $$;
COMMIT;

-- ===== T13: self-created rows cannot enter the archive =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000a', true);
DO $$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.set_event_archived('ae000000-0000-0000-0000-0000000000e2', true);
  EXCEPTION WHEN raise_exception THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'FAIL T13: A archived a self-created row';
  END IF;
  IF (SELECT archived_at FROM public.events WHERE id = 'ae000000-0000-0000-0000-0000000000e2') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T13: rejected archive still set archived_at';
  END IF;
  RAISE NOTICE 'PASS T13: self-created rows are rejected from the archive';
END $$;
COMMIT;

-- ===== T14: owner deletes remain owner-only (the shipped policy) =====
-- The delete-policy hardening (received rows undeletable) was applied live
-- ahead of the client, restored, and deliberately dropped — see FEATURES.md
-- → Archive Received Events → Coordination Notes. What stays pinned here:
-- the owner-only boundary itself (B cannot delete A's row) and that a
-- self-created row deletes fine.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000b', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.events WHERE id = 'ae000000-0000-0000-0000-0000000000e3';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL T14: B deleted A''s row';
  END IF;
  RAISE NOTICE 'PASS T14a: cannot delete another user''s row';
END $$;
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ae000000-0000-0000-0000-00000000000a', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.events WHERE id = 'ae000000-0000-0000-0000-0000000000e2';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL T14: A could not delete a self-created row';
  END IF;
  RAISE NOTICE 'PASS T14b: self-created rows still delete';
END $$;
COMMIT;
