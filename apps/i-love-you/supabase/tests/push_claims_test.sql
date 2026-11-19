-- Push claims (FEATURES.md -> Notifications): the send-push decision in SQL.
-- Exactly-once per message, sender-only, the partner's per-channel level
-- ('none' suppresses unless urgent), the payload's channel identity and
-- personal settings, the ring throttle, and service_role-only execution.

\set ON_ERROR_STOP on

INSERT INTO auth.users (id, phone) VALUES
  ('d4000000-0000-0000-0000-00000000000a', '+15555550330'),
  ('d4000000-0000-0000-0000-00000000000b', '+15555550331');

DO $$
DECLARE v_code text; v record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'd4000000-0000-0000-0000-00000000000a', false);
  PERFORM public.set_display_name('Ramsey');
  SELECT invite_code INTO v_code FROM public.create_couple();
  PERFORM set_config('request.jwt.claim.sub', 'd4000000-0000-0000-0000-00000000000b', false);
  SELECT * INTO v FROM public.join_couple(v_code);
  PERFORM public.set_push_token('ExponentPushToken[partner-b]');
  PERFORM set_config('request.jwt.claim.sub', 'd4000000-0000-0000-0000-00000000000a', false);
END $$;

SELECT set_config('t.everyday', (SELECT id::text FROM public.get_channels() WHERE name = 'Everyday'), false);
SELECT set_config('t.heart', (SELECT id::text FROM public.get_channels() WHERE name = 'Heart-to-heart'), false);
SELECT set_config('t.logistics', (SELECT id::text FROM public.get_channels() WHERE name = 'Logistics'), false);

-- ===== T1: one claim per message, carrying the channel identity and the
-- partner's settings =====
DO $$
DECLARE v record; v_n integer;
BEGIN
  PERFORM public.send_message('d4000000-0000-0000-0000-0000000000a1', current_setting('t.everyday')::uuid, 'dinner at 7?');
  SELECT * INTO v FROM public.claim_message_push('d4000000-0000-0000-0000-0000000000a1', 'd4000000-0000-0000-0000-00000000000a');
  IF v.channel_name <> 'Everyday' OR v.sender_name <> 'Ramsey' OR v.partner_token <> 'ExponentPushToken[partner-b]'
     OR v.partner_settings ->> 'notify_level' <> 'notify' THEN
    RAISE EXCEPTION 'FAIL T1: claim row wrong: %', row_to_json(v);
  END IF;
  SELECT count(*) INTO v_n FROM public.claim_message_push('d4000000-0000-0000-0000-0000000000a1', 'd4000000-0000-0000-0000-00000000000a');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL T1: second claim returned a row'; END IF;
  RAISE NOTICE 'PASS T1: a message claims its push exactly once, with channel identity';
END $$;

-- ===== T2: only the sender's invoke can claim =====
DO $$
DECLARE v_n integer;
BEGIN
  PERFORM public.send_message('d4000000-0000-0000-0000-0000000000a2', current_setting('t.everyday')::uuid, 'second');
  SELECT count(*) INTO v_n FROM public.claim_message_push('d4000000-0000-0000-0000-0000000000a2', 'd4000000-0000-0000-0000-00000000000b');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL T2: non-sender claimed'; END IF;
  IF (SELECT notified_at FROM public.messages WHERE id = 'd4000000-0000-0000-0000-0000000000a2') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T2: non-sender burned the claim';
  END IF;
  RAISE NOTICE 'PASS T2: only the sender claims';
END $$;

-- ===== T3: quiet channels still claim (the payload goes out passive); the
-- partner's preview choice rides along =====
DO $$
DECLARE v record;
BEGIN
  PERFORM public.send_message('d4000000-0000-0000-0000-0000000000a3', current_setting('t.heart')::uuid, 'can we talk tonight');
  SELECT * INTO v FROM public.claim_message_push('d4000000-0000-0000-0000-0000000000a3', 'd4000000-0000-0000-0000-00000000000a');
  IF v.partner_settings ->> 'notify_level' <> 'quiet' OR v.partner_settings ->> 'notify_preview' <> 'false' THEN
    RAISE EXCEPTION 'FAIL T3: heart settings not carried: %', v.partner_settings;
  END IF;
  RAISE NOTICE 'PASS T3: quiet channels claim with the partner''s level and preview choice';
END $$;

-- ===== T4: 'none' suppresses — unless the message needs them now =====
DO $$
DECLARE v_n integer; v record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'd4000000-0000-0000-0000-00000000000b', false);
  PERFORM public.set_channel_setting(current_setting('t.logistics')::uuid, 'notify_level', '"none"');
  PERFORM set_config('request.jwt.claim.sub', 'd4000000-0000-0000-0000-00000000000a', false);
  PERFORM public.send_message('d4000000-0000-0000-0000-0000000000a4', current_setting('t.logistics')::uuid, 'fyi');
  SELECT count(*) INTO v_n FROM public.claim_message_push('d4000000-0000-0000-0000-0000000000a4', 'd4000000-0000-0000-0000-00000000000a');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL T4: muted channel notified'; END IF;
  PERFORM public.send_message('d4000000-0000-0000-0000-0000000000a5', current_setting('t.logistics')::uuid,
    'the car broke down', 'text', NULL, NULL, true);
  SELECT * INTO v FROM public.claim_message_push('d4000000-0000-0000-0000-0000000000a5', 'd4000000-0000-0000-0000-00000000000a');
  IF NOT FOUND OR NOT v.urgent THEN RAISE EXCEPTION 'FAIL T4: urgent did not override none'; END IF;
  RAISE NOTICE 'PASS T4: none suppresses; needs-you-now overrides';
END $$;

-- ===== T5: no partner token, no claim =====
DO $$
DECLARE v_n integer;
BEGIN
  UPDATE public.users SET expo_push_token = NULL WHERE id = 'd4000000-0000-0000-0000-00000000000b';
  PERFORM public.send_message('d4000000-0000-0000-0000-0000000000a6', current_setting('t.everyday')::uuid, 'anyone?');
  SELECT count(*) INTO v_n FROM public.claim_message_push('d4000000-0000-0000-0000-0000000000a6', 'd4000000-0000-0000-0000-00000000000a');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL T5: claimed without a token'; END IF;
  UPDATE public.users SET expo_push_token = 'ExponentPushToken[partner-b]' WHERE id = 'd4000000-0000-0000-0000-00000000000b';
  RAISE NOTICE 'PASS T5: no token, no push';
END $$;

-- ===== T6: rings throttle to one a minute; room_for_member names the room =====
DO $$
DECLARE v record; v_n integer; v_room record;
BEGIN
  SELECT * INTO v FROM public.claim_ring_push('d4000000-0000-0000-0000-00000000000a');
  IF v.partner_token <> 'ExponentPushToken[partner-b]' OR v.caller_name <> 'Ramsey' THEN
    RAISE EXCEPTION 'FAIL T6: ring claim wrong';
  END IF;
  SELECT count(*) INTO v_n FROM public.claim_ring_push('d4000000-0000-0000-0000-00000000000b');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL T6: second ring within a minute'; END IF;
  SELECT * INTO v_room FROM public.room_for_member('d4000000-0000-0000-0000-00000000000b');
  IF v_room.room <> 'couple-' || v.couple_id::text THEN RAISE EXCEPTION 'FAIL T6: room name wrong'; END IF;
  RAISE NOTICE 'PASS T6: ring throttle and one room per couple';
END $$;

-- ===== T7: a token moves with the device; clear_push_token clears it =====
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'd4000000-0000-0000-0000-00000000000a', false);
  PERFORM public.set_push_token('ExponentPushToken[partner-b]');
  IF (SELECT expo_push_token FROM public.users WHERE id = 'd4000000-0000-0000-0000-00000000000b') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T7: token stayed on the previous account';
  END IF;
  PERFORM public.clear_push_token('ExponentPushToken[partner-b]');
  IF (SELECT expo_push_token FROM public.users WHERE id = 'd4000000-0000-0000-0000-00000000000a') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T7: clear_push_token did not clear';
  END IF;
  RAISE NOTICE 'PASS T7: tokens move with the device and clear on DeviceNotRegistered';
END $$;

-- ===== T8: claims are service_role only =====
BEGIN;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM public.claim_ring_push('d4000000-0000-0000-0000-00000000000a');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T8: authenticated can claim rings'; END IF;
END $$;
COMMIT;
DO $$ BEGIN RAISE NOTICE 'PASS T8: claims are service_role only'; END $$;

DO $$ BEGIN RAISE NOTICE 'ALL PUSH CLAIM TESTS PASSED'; END $$;
