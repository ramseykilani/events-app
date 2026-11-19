-- Pairing semantics (FEATURES.md -> Pairing): create/join, the two-person
-- invariant (structural, and closed after pairing), code hygiene (single use,
-- expiry, own code, normalization), the brute-force throttle, seeding from
-- presets, and what get_my_couple reveals.
-- Impersonation: set_config('request.jwt.claim.sub', ...) (auth.uid() reads it).

\set ON_ERROR_STOP on

-- Cast ('a1' prefix): A creates, B joins, C is a would-be third, D starts and
-- abandons a couple of their own.
INSERT INTO auth.users (id, phone) VALUES
  ('a1000000-0000-0000-0000-00000000000a', '+15555550300'),
  ('a1000000-0000-0000-0000-00000000000b', '+15555550301'),
  ('a1000000-0000-0000-0000-00000000000c', '+15555550302'),
  ('a1000000-0000-0000-0000-00000000000d', '+15555550303');

-- ===== T1: the auth trigger creates public.users rows =====
DO $$
BEGIN
  IF (SELECT count(*) FROM public.users WHERE id::text LIKE 'a1000000%') <> 4 THEN
    RAISE EXCEPTION 'FAIL T1: auth trigger did not create users rows';
  END IF;
  RAISE NOTICE 'PASS T1: auth trigger creates users rows';
END $$;

-- ===== T2: create_couple returns a well-formed code, idempotently =====
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000000a', false);
SELECT public.set_display_name('  Ramsey   K ');
DO $$
DECLARE v1 record; v2 record;
BEGIN
  SELECT * INTO v1 FROM public.create_couple();
  SELECT * INTO v2 FROM public.create_couple();
  IF v1.invite_code !~ '^[A-HJ-NP-Z2-9]{8}$' THEN
    RAISE EXCEPTION 'FAIL T2: bad code shape %', v1.invite_code;
  END IF;
  IF v1.couple_id <> v2.couple_id OR v1.invite_code <> v2.invite_code THEN
    RAISE EXCEPTION 'FAIL T2: create_couple is not idempotent';
  END IF;
  IF (SELECT display_name FROM public.users WHERE id = 'a1000000-0000-0000-0000-00000000000a') <> 'Ramsey K' THEN
    RAISE EXCEPTION 'FAIL T2: display name not normalized';
  END IF;
  RAISE NOTICE 'PASS T2: create_couple is idempotent with a readable code; names normalize';
END $$;

-- ===== T3: entering your own code is refused without a strike =====
DO $$
DECLARE v_code text; v record;
BEGIN
  SELECT invite_code INTO v_code FROM public.get_my_couple();
  SELECT * INTO v FROM public.join_couple(v_code);
  IF v.status <> 'own_code' THEN RAISE EXCEPTION 'FAIL T3: got %', v.status; END IF;
  IF EXISTS (SELECT 1 FROM public.pair_attempts WHERE user_id = 'a1000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'FAIL T3: own code counted as a failed attempt';
  END IF;
  RAISE NOTICE 'PASS T3: own code is refused and not counted';
END $$;

-- ===== T4: B had started a couple of their own, then joins A's with a
-- normalized code (lowercase, spaces, dashes) — B's own couple is abandoned =====
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000000b', false);
SELECT public.set_display_name('Natasha');
SELECT set_config('t.b_own', (SELECT couple_id::text FROM public.create_couple()), false);
DO $$
DECLARE v_code text; v record; v_a_couple uuid;
BEGIN
  SELECT c.invite_code, c.id INTO v_code, v_a_couple FROM public.couples c
    JOIN public.couple_members cm ON cm.couple_id = c.id
    WHERE cm.user_id = 'a1000000-0000-0000-0000-00000000000a';
  SELECT * INTO v FROM public.join_couple(lower(substr(v_code, 1, 4)) || ' - ' || substr(v_code, 5));
  IF v.status <> 'paired' OR v.couple_id <> v_a_couple THEN
    RAISE EXCEPTION 'FAIL T4: join failed: %', v.status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.couples WHERE id = current_setting('t.b_own')::uuid) THEN
    RAISE EXCEPTION 'FAIL T4: the couple B started was not abandoned';
  END IF;
  RAISE NOTICE 'PASS T4: B joins with a normalized code; their own unpaired couple goes';
END $$;

DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.couples c
    JOIN public.couple_members cm ON cm.couple_id = c.id
    WHERE cm.user_id = 'a1000000-0000-0000-0000-00000000000b';
  IF v.paired_at IS NULL OR v.invite_code IS NOT NULL OR v.invite_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T5: pairing did not close the couple and clear the code';
  END IF;
  RAISE NOTICE 'PASS T5: pairing closes the couple and clears the code';
END $$;

-- ===== T6: seeding — the three seed presets, in order, with their settings,
-- and prefs rows for both members carrying the personal preset values =====
DO $$
DECLARE v_names text; v_heart uuid; v_log uuid; v_quiet integer;
BEGIN
  SELECT string_agg(name, ',' ORDER BY position) INTO v_names FROM public.channels ch
    JOIN public.couple_members cm ON cm.couple_id = ch.couple_id
    WHERE cm.user_id = 'a1000000-0000-0000-0000-00000000000a';
  IF v_names <> 'Everyday,Heart-to-heart,Logistics' THEN
    RAISE EXCEPTION 'FAIL T6: seeded channels were %', v_names;
  END IF;
  SELECT ch.id INTO v_heart FROM public.channels ch
    JOIN public.couple_members cm ON cm.couple_id = ch.couple_id
    WHERE cm.user_id = 'a1000000-0000-0000-0000-00000000000a' AND ch.name = 'Heart-to-heart';
  SELECT ch.id INTO v_log FROM public.channels ch
    JOIN public.couple_members cm ON cm.couple_id = ch.couple_id
    WHERE cm.user_id = 'a1000000-0000-0000-0000-00000000000a' AND ch.name = 'Logistics';
  SELECT count(*) INTO v_quiet FROM public.channel_prefs
    WHERE channel_id = v_heart AND settings ->> 'notify_level' = 'quiet';
  IF v_quiet <> 2 THEN
    RAISE EXCEPTION 'FAIL T6: heart-to-heart should start quiet for both, got %', v_quiet;
  END IF;
  IF NOT (SELECT (settings ->> 'items_completable')::boolean AND (settings ->> 'read_receipts')::boolean
          FROM public.channels WHERE id = v_log) THEN
    RAISE EXCEPTION 'FAIL T6: logistics preset settings missing';
  END IF;
  RAISE NOTICE 'PASS T6: pairing seeds the three presets with their settings for both people';
END $$;

-- ===== T7: cancel_invite removes an unpaired couple =====
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000000d', false);
SELECT couple_id FROM public.create_couple();
SELECT public.cancel_invite();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.couple_members WHERE user_id = 'a1000000-0000-0000-0000-00000000000d') THEN
    RAISE EXCEPTION 'FAIL T7: D still in a couple';
  END IF;
  RAISE NOTICE 'PASS T7: cancel_invite removes an unpaired couple';
END $$;

-- ===== T8: a third person cannot get in — the code is spent, and a direct
-- insert hits the paired guard; a slot 3 is impossible by CHECK =====
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000000c', false);
DO $$
DECLARE v record; v_couple uuid; v_failed boolean;
BEGIN
  SELECT cm.couple_id INTO v_couple FROM public.couple_members cm
    WHERE cm.user_id = 'a1000000-0000-0000-0000-00000000000a';

  v_failed := false;
  BEGIN
    INSERT INTO public.couple_members (couple_id, slot, user_id)
      VALUES (v_couple, 2, 'a1000000-0000-0000-0000-00000000000c');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T8: direct insert into a paired couple succeeded'; END IF;

  v_failed := false;
  BEGIN
    UPDATE public.couples SET paired_at = NULL WHERE id = v_couple;
    INSERT INTO public.couple_members (couple_id, slot, user_id)
      VALUES (v_couple, 3, 'a1000000-0000-0000-0000-00000000000c');
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T8: slot 3 accepted'; END IF;

  v_failed := false;
  BEGIN
    -- Reopen the guard inside the sub-block (rolled back with it) so the
    -- primary key is what refuses the row.
    UPDATE public.couples SET paired_at = NULL WHERE id = v_couple;
    INSERT INTO public.couple_members (couple_id, slot, user_id)
      VALUES (v_couple, 1, 'a1000000-0000-0000-0000-00000000000c');
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T8: duplicate slot accepted'; END IF;
  IF (SELECT paired_at FROM public.couples WHERE id = v_couple) IS NULL THEN
    RAISE EXCEPTION 'FAIL T8: test left the couple open';
  END IF;

  RAISE NOTICE 'PASS T8: no third member — spent code, paired guard, slot CHECK and key';
END $$;

-- ===== T9: a person is in at most one couple =====
DO $$
DECLARE v_failed boolean := false; v_other uuid;
BEGIN
  INSERT INTO public.couples (created_by) VALUES ('a1000000-0000-0000-0000-00000000000c') RETURNING id INTO v_other;
  BEGIN
    INSERT INTO public.couple_members (couple_id, slot, user_id)
      VALUES (v_other, 1, 'a1000000-0000-0000-0000-00000000000a');
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  DELETE FROM public.couples WHERE id = v_other;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T9: A joined a second couple'; END IF;
  RAISE NOTICE 'PASS T9: one couple per person';
END $$;

-- ===== T10: already-paired people cannot join or create =====
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000000b', false);
DO $$
DECLARE v record; v_failed boolean := false;
BEGIN
  SELECT * INTO v FROM public.join_couple('ABCDEFGH');
  IF v.status <> 'already_paired' THEN RAISE EXCEPTION 'FAIL T10: got %', v.status; END IF;
  BEGIN
    PERFORM public.create_couple();
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T10: paired person created a couple'; END IF;
  RAISE NOTICE 'PASS T10: paired people cannot join or create';
END $$;

-- ===== T11: expired codes are refused; create_couple re-opens with a new
-- code =====
DO $$
DECLARE v_first record; v_again record; v_status text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000000d', false);
  SELECT * INTO v_first FROM public.create_couple();
  UPDATE public.couples SET invite_expires_at = now() - interval '1 minute' WHERE id = v_first.couple_id;
  PERFORM set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000000c', false);
  SELECT status INTO v_status FROM public.join_couple(v_first.invite_code);
  PERFORM set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000000d', false);
  SELECT * INTO v_again FROM public.create_couple();
  IF v_status <> 'expired' THEN RAISE EXCEPTION 'FAIL T11: got %', v_status; END IF;
  IF v_again.couple_id <> v_first.couple_id OR v_again.invite_code = v_first.invite_code THEN
    RAISE EXCEPTION 'FAIL T11: expired couple not re-opened with a new code';
  END IF;
  RAISE NOTICE 'PASS T11: expired code refused; create_couple issues a fresh one';
END $$;

-- ===== T12: the throttle — ten misses in an hour, then rate_limited even
-- for a valid code =====
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000000c', false);
DO $$
DECLARE i integer; v record; v_code text;
BEGIN
  DELETE FROM public.pair_attempts WHERE user_id = 'a1000000-0000-0000-0000-00000000000c';
  FOR i IN 1..10 LOOP
    SELECT * INTO v FROM public.join_couple('ZZZZZZZZ');
    IF v.status <> 'invalid' THEN RAISE EXCEPTION 'FAIL T12: miss % got %', i, v.status; END IF;
  END LOOP;
  SELECT invite_code INTO v_code FROM public.couples WHERE id = (
    SELECT couple_id FROM public.couple_members WHERE user_id = 'a1000000-0000-0000-0000-00000000000d');
  SELECT * INTO v FROM public.join_couple(v_code);
  IF v.status <> 'rate_limited' THEN RAISE EXCEPTION 'FAIL T12: got %', v.status; END IF;
  RAISE NOTICE 'PASS T12: ten misses per hour, then rate limited';
END $$;

-- ===== T13: get_my_couple shows the partner's name, never their phone or
-- token; the code only while unpaired =====
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000000a', false);
UPDATE public.users SET expo_push_token = 'ExponentPushToken[b]' WHERE id = 'a1000000-0000-0000-0000-00000000000b';
DO $$
DECLARE v record; v_json text;
BEGIN
  SELECT * INTO v FROM public.get_my_couple();
  IF v.partner_display_name <> 'Natasha' OR v.my_display_name <> 'Ramsey K' THEN
    RAISE EXCEPTION 'FAIL T13: names wrong';
  END IF;
  IF v.invite_code IS NOT NULL THEN RAISE EXCEPTION 'FAIL T13: paired couple exposes a code'; END IF;
  v_json := row_to_json(v)::text;
  IF v_json LIKE '%ExponentPushToken%' OR v_json LIKE '%5555550301%' THEN
    RAISE EXCEPTION 'FAIL T13: partner token or phone leaked';
  END IF;
  RAISE NOTICE 'PASS T13: get_my_couple reveals the partner name only';
END $$;

-- ===== T14: RLS — the partner's users row is invisible; couples and members
-- only within your couple; anon sees nothing =====
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000000a', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.users) <> 1 THEN RAISE EXCEPTION 'FAIL T14: users rows visible beyond own'; END IF;
  IF (SELECT count(*) FROM public.couple_members) <> 2 THEN RAISE EXCEPTION 'FAIL T14: member rows wrong'; END IF;
  IF (SELECT count(*) FROM public.couples) <> 1 THEN RAISE EXCEPTION 'FAIL T14: couples rows wrong'; END IF;
  IF (SELECT count(*) FROM public.pair_attempts) <> 0 THEN RAISE EXCEPTION 'FAIL T14: pair_attempts readable'; END IF;
END $$;
COMMIT;
BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE v_failed boolean := false;
BEGIN
  IF (SELECT count(*) FROM public.couples) <> 0 OR (SELECT count(*) FROM public.channels) <> 0 THEN
    RAISE EXCEPTION 'FAIL T14: anon reads rows';
  END IF;
  BEGIN
    PERFORM public.create_couple();
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T14: anon can execute create_couple'; END IF;
END $$;
COMMIT;
DO $$ BEGIN RAISE NOTICE 'PASS T14: RLS scopes users/couples/members; anon gets nothing'; END $$;

-- ===== T15: no direct writes — RLS has no write policies =====
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000000a', true);
DO $$
DECLARE v_n integer; v_failed boolean := false;
BEGIN
  UPDATE public.couples SET invite_code = 'AAAAAAAA';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL T15: direct couples update landed'; END IF;
  BEGIN
    INSERT INTO public.couple_members (couple_id, slot, user_id)
      VALUES (public.my_couple_id(), 2, 'a1000000-0000-0000-0000-00000000000c');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T15: direct member insert allowed'; END IF;
END $$;
COMMIT;
DO $$ BEGIN RAISE NOTICE 'PASS T15: no direct writes to couples or members'; END $$;

DO $$ BEGIN RAISE NOTICE 'ALL PAIRING TESTS PASSED'; END $$;
