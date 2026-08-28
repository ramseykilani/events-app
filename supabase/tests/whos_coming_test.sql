-- Functional test of Who's Coming (FEATURES.md): the yes/no response slot on
-- every send. Covers the schema (NULL default, CHECK, token uniqueness), the
-- respond_to_send / get_my_send_response RPCs (happy path, changed-flag
-- semantics, rejection paths), RLS (recipients have no direct sends access),
-- forwarding (Carol answers Bob, not Alice), and that an answer is not
-- inferred from calendar presence (removing the copy keeps the answer).
-- Impersonation: SET request.jwt.claim.sub (auth.uid() reads it).

\set ON_ERROR_STOP on

-- Cast (fixed UUIDs, 'cc' prefix to stay clear of the other suites)
-- users: A=cc000000-...-000a  B=cc000000-...-000b  C=cc000000-...-000c
-- events: E1 (A, created) cc000000-...-00e1; B's and C's copies get
--         generated ids (looked up where needed)
-- my_people: A->B cc000000-...-00c1, B->A cc000000-...-00c2,
--            B->C cc000000-...-00c3, A->pending cc000000-...-00c4

INSERT INTO auth.users (id, phone) VALUES
  ('cc000000-0000-0000-0000-00000000000a', '+15555550420'),
  ('cc000000-0000-0000-0000-00000000000b', '+15555550421'),
  ('cc000000-0000-0000-0000-00000000000c', '+15555550422');
-- handle_new_auth_user trigger inserts public.users rows automatically

-- A has a display name; B's contact for A carries a contact_name (which wins
-- attribution). Phones resolve user_id on insert via the BEFORE INSERT
-- resolver.
UPDATE public.users SET display_name = 'Alice A'
  WHERE id = 'cc000000-0000-0000-0000-00000000000a';

INSERT INTO public.my_people (id, owner_id, phone_number, contact_name) VALUES
  ('cc000000-0000-0000-0000-0000000000c1', 'cc000000-0000-0000-0000-00000000000a', '+15555550421', 'Bee'),
  ('cc000000-0000-0000-0000-0000000000c2', 'cc000000-0000-0000-0000-00000000000b', '+15555550420', 'Alice'),
  ('cc000000-0000-0000-0000-0000000000c3', 'cc000000-0000-0000-0000-00000000000b', '+15555550422', 'Cee'),
  ('cc000000-0000-0000-0000-0000000000c4', 'cc000000-0000-0000-0000-00000000000a', '+14165550099', 'Pending Pam');

-- The scratch DB has no Supabase default privileges; grant what the real
-- project grants so RLS does the filtering. Hosted Supabase grants UPDATE on
-- sends to authenticated too — include it so T7 pins the real control (no
-- UPDATE policy → zero rows) rather than the scratch DB's missing grant.
GRANT SELECT, DELETE ON public.events TO authenticated;
GRANT SELECT, UPDATE ON public.sends TO authenticated;

-- A creates an event and shares it to B (app user) and Pending Pam.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000a', true);
SELECT public.save_event(
  'cc000000-0000-0000-0000-0000000000e1',
  null, 'Who Is Coming Test', null, null, '2026-10-01', '20:00'
);
SELECT public.share_event(
  'cc000000-0000-0000-0000-0000000000e1',
  ARRAY['cc000000-0000-0000-0000-0000000000c1', 'cc000000-0000-0000-0000-0000000000c4']::uuid[]
);
COMMIT;

-- ===== T0: fresh sends carry an empty answer slot and a response token =====
DO $$
DECLARE v record; v_dupes integer;
BEGIN
  SELECT response, responded_at, response_token INTO v
    FROM public.sends
    WHERE event_id = 'cc000000-0000-0000-0000-0000000000e1'
      AND person_id = 'cc000000-0000-0000-0000-0000000000c1';
  IF v.response IS NOT NULL OR v.responded_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T0: fresh send should be unanswered, got %/%', v.response, v.responded_at;
  END IF;
  IF v.response_token IS NULL THEN
    RAISE EXCEPTION 'FAIL T0: fresh send has no response_token';
  END IF;
  SELECT count(*) INTO v_dupes FROM (
    SELECT response_token FROM public.sends GROUP BY response_token HAVING count(*) > 1
  ) d;
  IF v_dupes <> 0 THEN
    RAISE EXCEPTION 'FAIL T0: response_token not unique across sends';
  END IF;
  RAISE NOTICE 'PASS T0: fresh sends are unanswered with a unique token';
END $$;

-- ===== T1: B answers yes on their own copy → changed = true =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v_copy uuid; v_changed boolean;
BEGIN
  SELECT id INTO v_copy FROM public.events
    WHERE owner_id = 'cc000000-0000-0000-0000-00000000000b'
      AND from_event_id = 'cc000000-0000-0000-0000-0000000000e1';
  SELECT public.respond_to_send(v_copy, 'yes') INTO v_changed;
  IF NOT v_changed THEN
    RAISE EXCEPTION 'FAIL T1: first answer should report changed';
  END IF;
END $$;
COMMIT;

DO $$
DECLARE v record;
BEGIN
  SELECT response, responded_at INTO v FROM public.sends
    WHERE event_id = 'cc000000-0000-0000-0000-0000000000e1'
      AND person_id = 'cc000000-0000-0000-0000-0000000000c1';
  IF v.response IS DISTINCT FROM 'yes' OR v.responded_at IS NULL THEN
    RAISE EXCEPTION 'FAIL T1: answer did not land, got %/%', v.response, v.responded_at;
  END IF;
  RAISE NOTICE 'PASS T1: recipient answers yes on the send';
END $$;

-- ===== T2: the same answer again → changed = false, responded_at kept =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE
  v_copy uuid;
  v_changed boolean;
  v_before timestamptz;
  v_after timestamptz;
BEGIN
  SELECT id INTO v_copy FROM public.events
    WHERE owner_id = 'cc000000-0000-0000-0000-00000000000b'
      AND from_event_id = 'cc000000-0000-0000-0000-0000000000e1';
  SELECT responded_at INTO v_before FROM public.sends
    WHERE event_id = 'cc000000-0000-0000-0000-0000000000e1'
      AND person_id = 'cc000000-0000-0000-0000-0000000000c1';
  SELECT public.respond_to_send(v_copy, 'yes') INTO v_changed;
  IF v_changed THEN
    RAISE EXCEPTION 'FAIL T2: re-saving the same answer must report unchanged';
  END IF;
  SELECT responded_at INTO v_after FROM public.sends
    WHERE event_id = 'cc000000-0000-0000-0000-0000000000e1'
      AND person_id = 'cc000000-0000-0000-0000-0000000000c1';
  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'FAIL T2: unchanged answer rewrote responded_at';
  END IF;
  RAISE NOTICE 'PASS T2: same answer is a no-op (no push owed to the asker)';
END $$;
COMMIT;

-- ===== T3: a flip (yes -> no) → changed = true =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v_copy uuid; v_changed boolean;
BEGIN
  SELECT id INTO v_copy FROM public.events
    WHERE owner_id = 'cc000000-0000-0000-0000-00000000000b'
      AND from_event_id = 'cc000000-0000-0000-0000-0000000000e1';
  SELECT public.respond_to_send(v_copy, 'no') INTO v_changed;
  IF NOT v_changed THEN
    RAISE EXCEPTION 'FAIL T3: a flip must report changed';
  END IF;
  RAISE NOTICE 'PASS T3: last write wins (flip lands and reports changed)';
END $$;
COMMIT;

-- ===== T3b: a re-share preserves the answer and the receipt token =====
-- (share_event is ON CONFLICT DO NOTHING for an existing send — the same
-- link keeps working after a later invite text arrives.)
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000a', true);
DO $$
DECLARE v_before record; v_after record;
BEGIN
  SELECT response, response_token INTO v_before FROM public.sends
    WHERE event_id = 'cc000000-0000-0000-0000-0000000000e1'
      AND person_id = 'cc000000-0000-0000-0000-0000000000c1';
  IF v_before.response IS DISTINCT FROM 'no' THEN
    RAISE EXCEPTION 'FAIL T3b: precondition — expected answer no, got %', v_before.response;
  END IF;
  PERFORM public.share_event(
    'cc000000-0000-0000-0000-0000000000e1',
    ARRAY['cc000000-0000-0000-0000-0000000000c1']::uuid[]
  );
  SELECT response, response_token INTO v_after FROM public.sends
    WHERE event_id = 'cc000000-0000-0000-0000-0000000000e1'
      AND person_id = 'cc000000-0000-0000-0000-0000000000c1';
  IF v_after.response IS DISTINCT FROM v_before.response
     OR v_after.response_token IS DISTINCT FROM v_before.response_token THEN
    RAISE EXCEPTION 'FAIL T3b: re-share mutated the send (answer % -> %, token rotated: %)',
      v_before.response, v_after.response,
      v_after.response_token IS DISTINCT FROM v_before.response_token;
  END IF;
  RAISE NOTICE 'PASS T3b: re-share preserves the answer and the receipt token';
END $$;
COMMIT;
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v_copy uuid; v_rejected boolean := false;
BEGIN
  SELECT id INTO v_copy FROM public.events
    WHERE owner_id = 'cc000000-0000-0000-0000-00000000000b'
      AND from_event_id = 'cc000000-0000-0000-0000-0000000000e1';
  BEGIN
    PERFORM public.respond_to_send(v_copy, 'maybe');
  EXCEPTION WHEN raise_exception THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'FAIL T4: invalid response accepted';
  END IF;
  RAISE NOTICE 'PASS T4: invalid response rejected';
END $$;
COMMIT;

-- ===== T5: you don't answer a row you created =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000a', true);
DO $$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.respond_to_send('cc000000-0000-0000-0000-0000000000e1', 'yes');
  EXCEPTION WHEN raise_exception THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'FAIL T5: asker answered their own event';
  END IF;
  RAISE NOTICE 'PASS T5: self-created row has no response slot';
END $$;
COMMIT;

-- ===== T6: a non-recipient cannot answer someone else's copy =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000c', true);
DO $$
DECLARE v_b_copy uuid; v_rejected boolean := false;
BEGIN
  SELECT id INTO v_b_copy FROM public.events
    WHERE owner_id = 'cc000000-0000-0000-0000-00000000000b'
      AND from_event_id = 'cc000000-0000-0000-0000-0000000000e1';
  BEGIN
    PERFORM public.respond_to_send(v_b_copy, 'yes');
  EXCEPTION WHEN raise_exception THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'FAIL T6: non-owner answered B''s copy';
  END IF;
  RAISE NOTICE 'PASS T6: only the copy owner can answer';
END $$;
COMMIT;

-- ===== T7: RLS — the recipient has no direct path to the sender's sends =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000b', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.sends
    WHERE event_id = 'cc000000-0000-0000-0000-0000000000e1';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL T7: recipient read % sends rows directly', v_count;
  END IF;
  -- With the hosted UPDATE grant in place, the denial comes from RLS alone:
  -- no UPDATE policy, so the write silently matches zero rows.
  UPDATE public.sends SET response = 'yes'
    WHERE event_id = 'cc000000-0000-0000-0000-0000000000e1';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL T7: recipient updated % sends rows directly', v_count;
  END IF;
  RAISE NOTICE 'PASS T7: recipient cannot read or write sends directly';
END $$;
COMMIT;

-- ===== T8: get_my_send_response returns the answer + attribution =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v_copy uuid; v record; v_found boolean;
BEGIN
  SELECT id INTO v_copy FROM public.events
    WHERE owner_id = 'cc000000-0000-0000-0000-00000000000b'
      AND from_event_id = 'cc000000-0000-0000-0000-0000000000e1';
  SELECT * INTO v FROM public.get_my_send_response(v_copy);
  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF NOT v_found THEN
    RAISE EXCEPTION 'FAIL T8: answerable share returned no row';
  END IF;
  IF v.response IS DISTINCT FROM 'no' THEN
    RAISE EXCEPTION 'FAIL T8: expected stored answer no, got %', v.response;
  END IF;
  IF v.sharer_name IS DISTINCT FROM 'Alice' THEN
    RAISE EXCEPTION 'FAIL T8: expected contact_name attribution Alice, got %', v.sharer_name;
  END IF;
  RAISE NOTICE 'PASS T8: recipient reads own answer with sharer attribution';
END $$;
COMMIT;

-- ===== T9: a self-created row returns zero rows (no widget) =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000a', true);
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.get_my_send_response('cc000000-0000-0000-0000-0000000000e1');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL T9: self-created row returned % response rows', v_count;
  END IF;
  RAISE NOTICE 'PASS T9: self-created row has nothing to answer';
END $$;
COMMIT;

-- ===== T9b: the anon role cannot execute the response RPCs =====
BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE v_rejected boolean;
BEGIN
  v_rejected := false;
  BEGIN
    PERFORM public.respond_to_send('cc000000-0000-0000-0000-0000000000e1', 'yes');
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'FAIL T9b: anon executed respond_to_send';
  END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.get_my_send_response('cc000000-0000-0000-0000-0000000000e1');
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'FAIL T9b: anon executed get_my_send_response';
  END IF;
  RAISE NOTICE 'PASS T9b: anon cannot execute the response RPCs';
END $$;
COMMIT;

-- ===== T10: forwarding — C answers B, not A =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v_b_copy uuid;
BEGIN
  SELECT id INTO v_b_copy FROM public.events
    WHERE owner_id = 'cc000000-0000-0000-0000-00000000000b'
      AND from_event_id = 'cc000000-0000-0000-0000-0000000000e1';
  PERFORM public.share_event(v_b_copy, ARRAY['cc000000-0000-0000-0000-0000000000c3']::uuid[]);
END $$;
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000c', true);
DO $$
DECLARE v_c_copy uuid; v_b_copy uuid; v_changed boolean;
BEGIN
  SELECT id INTO v_b_copy FROM public.events
    WHERE owner_id = 'cc000000-0000-0000-0000-00000000000b'
      AND from_event_id = 'cc000000-0000-0000-0000-0000000000e1';
  SELECT id INTO v_c_copy FROM public.events
    WHERE owner_id = 'cc000000-0000-0000-0000-00000000000c'
      AND from_event_id = v_b_copy;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL T10: C did not receive a copy from B';
  END IF;
  SELECT public.respond_to_send(v_c_copy, 'yes') INTO v_changed;
  IF NOT v_changed THEN
    RAISE EXCEPTION 'FAIL T10: C''s answer should report changed';
  END IF;
END $$;
COMMIT;

DO $$
DECLARE v_bc record; v_ab record;
BEGIN
  -- The send on B's row (B -> C) carries C's answer...
  SELECT s.response INTO v_bc FROM public.sends s
    JOIN public.events e ON e.id = s.event_id
    WHERE e.owner_id = 'cc000000-0000-0000-0000-00000000000b'
      AND s.person_id = 'cc000000-0000-0000-0000-0000000000c3';
  IF v_bc.response IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'FAIL T10: C''s answer did not land on B''s send, got %', v_bc.response;
  END IF;
  -- ...and A's send (A -> B) is untouched: Carol answers Bob, not Alice.
  SELECT response INTO v_ab FROM public.sends
    WHERE event_id = 'cc000000-0000-0000-0000-0000000000e1'
      AND person_id = 'cc000000-0000-0000-0000-0000000000c1';
  IF v_ab.response IS DISTINCT FROM 'no' THEN
    RAISE EXCEPTION 'FAIL T10: A''s send changed during forwarding, got %', v_ab.response;
  END IF;
  RAISE NOTICE 'PASS T10: a forward is a new ask, answered to the forwarder';
END $$;

-- ===== T11: removing the copy keeps the answer (not inferred from presence) =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000b', true);
SET LOCAL ROLE authenticated;
DELETE FROM public.events
  WHERE owner_id = 'cc000000-0000-0000-0000-00000000000b'
    AND from_event_id = 'cc000000-0000-0000-0000-0000000000e1';
COMMIT;

DO $$
DECLARE v record;
BEGIN
  SELECT response INTO v FROM public.sends
    WHERE event_id = 'cc000000-0000-0000-0000-0000000000e1'
      AND person_id = 'cc000000-0000-0000-0000-0000000000c1';
  IF v.response IS DISTINCT FROM 'no' THEN
    RAISE EXCEPTION 'FAIL T11: answer vanished with the copy, got %', v.response;
  END IF;
  RAISE NOTICE 'PASS T11: removing the copy keeps the answer on the send';
END $$;

-- ===== T12: the pending contact's send stays unanswered until they exist =====
DO $$
DECLARE v record;
BEGIN
  SELECT response, response_token INTO v FROM public.sends
    WHERE event_id = 'cc000000-0000-0000-0000-0000000000e1'
      AND person_id = 'cc000000-0000-0000-0000-0000000000c4';
  IF v.response IS NOT NULL OR v.response_token IS NULL THEN
    RAISE EXCEPTION 'FAIL T12: pending send should be unanswered with a token, got %/%',
      v.response, v.response_token;
  END IF;
  RAISE NOTICE 'PASS T12: pending send carries an empty slot and its receipt-link token';
END $$;

-- ===== T13: the answer dies with the asker's event (sends cascade) =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-00000000000a', true);
SET LOCAL ROLE authenticated;
DELETE FROM public.events WHERE id = 'cc000000-0000-0000-0000-0000000000e1';
COMMIT;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.sends
    WHERE event_id = 'cc000000-0000-0000-0000-0000000000e1';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL T13: % sends survived the event delete', v_count;
  END IF;
  RAISE NOTICE 'PASS T13: sends (and their answers) cascade with the event';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL WHOS-COMING TESTS PASSED'; END $$;
