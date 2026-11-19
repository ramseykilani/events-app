-- Messaging semantics (FEATURES.md -> Messaging): idempotent send on the
-- client id, sender-only edit/delete (soft), done-marking and "needs you now"
-- gated by shared settings, set-to-value reactions, moving a message between
-- channels (author/time preserved), keyset paging, the catch-up feed, unread
-- flags, and RLS isolation.

\set ON_ERROR_STOP on

-- Two couples ('c3' prefix): A+B and X+Y.
INSERT INTO auth.users (id, phone) VALUES
  ('c3000000-0000-0000-0000-00000000000a', '+15555550320'),
  ('c3000000-0000-0000-0000-00000000000b', '+15555550321'),
  ('c3000000-0000-0000-0000-0000000000e1', '+15555550322'),
  ('c3000000-0000-0000-0000-0000000000f1', '+15555550323');

DO $$
DECLARE v_code text; v record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000a', false);
  SELECT invite_code INTO v_code FROM public.create_couple();
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000b', false);
  SELECT * INTO v FROM public.join_couple(v_code);
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-0000000000e1', false);
  SELECT invite_code INTO v_code FROM public.create_couple();
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-0000000000f1', false);
  SELECT * INTO v FROM public.join_couple(v_code);
END $$;

SELECT set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000a', false);
SELECT set_config('t.everyday', (SELECT id::text FROM public.get_channels() WHERE name = 'Everyday'), false);
SELECT set_config('t.heart', (SELECT id::text FROM public.get_channels() WHERE name = 'Heart-to-heart'), false);
SELECT set_config('t.logistics', (SELECT id::text FROM public.get_channels() WHERE name = 'Logistics'), false);
SELECT set_config('t.couple', public.my_couple_id()::text, false);

-- ===== T1: send is idempotent on the client id =====
DO $$
DECLARE v1 public.messages; v2 public.messages;
BEGIN
  v1 := public.send_message('c3000000-0000-0000-0000-0000000000a1', current_setting('t.everyday')::uuid, '  hello  ');
  v2 := public.send_message('c3000000-0000-0000-0000-0000000000a1', current_setting('t.everyday')::uuid, 'hello (retry)');
  IF v1.body <> 'hello' THEN RAISE EXCEPTION 'FAIL T1: body not trimmed: %', v1.body; END IF;
  IF v2.body <> 'hello' OR v2.created_at <> v1.created_at THEN RAISE EXCEPTION 'FAIL T1: retry changed the row'; END IF;
  IF (SELECT count(*) FROM public.messages WHERE id = 'c3000000-0000-0000-0000-0000000000a1') <> 1 THEN
    RAISE EXCEPTION 'FAIL T1: duplicate row';
  END IF;
  RAISE NOTICE 'PASS T1: send_message is idempotent on the client id';
END $$;

-- ===== T2: the channel row carries the last message; sender is read, the
-- partner is unread =====
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_channels() WHERE id = current_setting('t.everyday')::uuid;
  IF v.last_message_preview <> 'hello' OR v.unread THEN RAISE EXCEPTION 'FAIL T2: sender view %/%', v.last_message_preview, v.unread; END IF;
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000b', false);
  SELECT * INTO v FROM public.get_channels() WHERE id = current_setting('t.everyday')::uuid;
  IF NOT v.unread THEN RAISE EXCEPTION 'FAIL T2: partner not unread'; END IF;
  PERFORM public.mark_channel_read(current_setting('t.everyday')::uuid, now());
  SELECT * INTO v FROM public.get_channels() WHERE id = current_setting('t.everyday')::uuid;
  IF v.unread THEN RAISE EXCEPTION 'FAIL T2: still unread after mark_channel_read'; END IF;
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000a', false);
  RAISE NOTICE 'PASS T2: unread is a boolean that the read position clears';
END $$;

-- ===== T3: the partner cannot reuse an id; empty, archived and foreign
-- targets are refused =====
DO $$
DECLARE v_failed boolean; v_case text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000b', false);
  v_failed := false;
  BEGIN
    PERFORM public.send_message('c3000000-0000-0000-0000-0000000000a1', current_setting('t.everyday')::uuid, 'mine now');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T3: partner reused an id'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.send_message(gen_random_uuid(), current_setting('t.everyday')::uuid, E'  \n ');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T3: empty message accepted'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.send_message(gen_random_uuid(), current_setting('t.everyday')::uuid, NULL, 'image',
      '{"path": "00000000-0000-0000-0000-000000000000/x/y.jpg"}');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T3: attachment outside the couple accepted'; END IF;

  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-0000000000e1', false);
  v_failed := false;
  BEGIN
    PERFORM public.send_message(gen_random_uuid(), current_setting('t.everyday')::uuid, 'intruder');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T3: outsider posted'; END IF;

  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000a', false);
  PERFORM public.set_channel_archived(current_setting('t.heart')::uuid, true);
  v_failed := false;
  BEGIN
    PERFORM public.send_message(gen_random_uuid(), current_setting('t.heart')::uuid, 'to the archive');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T3: archived channel accepted a message'; END IF;
  PERFORM public.set_channel_archived(current_setting('t.heart')::uuid, false);
  RAISE NOTICE 'PASS T3: id reuse, empty, foreign attachment, outsider, archived all refused';
END $$;

-- ===== T4: images carry an attachment under the couple folder =====
DO $$
DECLARE v public.messages;
BEGIN
  v := public.send_message('c3000000-0000-0000-0000-0000000000a2', current_setting('t.everyday')::uuid, NULL, 'image',
    jsonb_build_object('path', current_setting('t.couple') || '/c3000000-0000-0000-0000-0000000000a2/photo.jpg',
                       'width', 800, 'height', 600));
  IF (SELECT last_message_preview FROM public.channels WHERE id = current_setting('t.everyday')::uuid) <> 'Photo' THEN
    RAISE EXCEPTION 'FAIL T4: preview for an image is not Photo';
  END IF;
  RAISE NOTICE 'PASS T4: image messages';
END $$;

-- ===== T5: edit — sender only, no-op on same body, marks edited_at =====
DO $$
DECLARE v public.messages; v_failed boolean := false;
BEGIN
  v := public.edit_message('c3000000-0000-0000-0000-0000000000a1', 'hello');
  IF v.edited_at IS NOT NULL THEN RAISE EXCEPTION 'FAIL T5: same-body edit marked edited'; END IF;
  v := public.edit_message('c3000000-0000-0000-0000-0000000000a1', 'hello there');
  IF v.edited_at IS NULL OR v.body <> 'hello there' THEN RAISE EXCEPTION 'FAIL T5: edit did not land'; END IF;
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000b', false);
  BEGIN
    PERFORM public.edit_message('c3000000-0000-0000-0000-0000000000a1', 'hijacked');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000a', false);
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T5: partner edited'; END IF;
  RAISE NOTICE 'PASS T5: sender-only edits, no-op on same body';
END $$;

-- ===== T6: reactions are set-to-value per person =====
DO $$
DECLARE v_changed boolean; v_r jsonb; v_failed boolean := false;
BEGIN
  SELECT public.set_reaction('c3000000-0000-0000-0000-0000000000a1', 'heart', true) INTO v_changed;
  SELECT public.set_reaction('c3000000-0000-0000-0000-0000000000a1', 'heart', true) INTO v_changed;
  IF v_changed THEN RAISE EXCEPTION 'FAIL T6: repeat reaction reported change'; END IF;
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000b', false);
  PERFORM public.set_reaction('c3000000-0000-0000-0000-0000000000a1', 'heart', true);
  SELECT reactions INTO v_r FROM public.messages WHERE id = 'c3000000-0000-0000-0000-0000000000a1';
  IF jsonb_array_length(v_r -> 'heart') <> 2 THEN RAISE EXCEPTION 'FAIL T6: both hearts not recorded: %', v_r; END IF;
  PERFORM public.set_reaction('c3000000-0000-0000-0000-0000000000a1', 'heart', false);
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000a', false);
  PERFORM public.set_reaction('c3000000-0000-0000-0000-0000000000a1', 'heart', false);
  SELECT reactions INTO v_r FROM public.messages WHERE id = 'c3000000-0000-0000-0000-0000000000a1';
  IF v_r <> '{}'::jsonb THEN RAISE EXCEPTION 'FAIL T6: empty reaction key not removed: %', v_r; END IF;
  BEGIN
    PERFORM public.set_reaction('c3000000-0000-0000-0000-0000000000a1', 'poop', true);
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T6: unknown reaction accepted'; END IF;
  RAISE NOTICE 'PASS T6: reactions are set-to-value from the fixed set';
END $$;

-- ===== T7: done-marking follows the shared setting, not the channel's name =====
DO $$
DECLARE v_failed boolean := false; v_changed boolean;
BEGIN
  PERFORM public.send_message('c3000000-0000-0000-0000-0000000000a3', current_setting('t.logistics')::uuid, 'Did you book the vet?');
  PERFORM public.send_message('c3000000-0000-0000-0000-0000000000a4', current_setting('t.everyday')::uuid, 'not an item');
  BEGIN
    PERFORM public.set_message_done('c3000000-0000-0000-0000-0000000000a4', true);
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T7: done in a channel without items'; END IF;

  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000b', false);
  SELECT public.set_message_done('c3000000-0000-0000-0000-0000000000a3', true) INTO v_changed;
  IF NOT v_changed THEN RAISE EXCEPTION 'FAIL T7: partner could not mark done'; END IF;
  SELECT public.set_message_done('c3000000-0000-0000-0000-0000000000a3', true) INTO v_changed;
  IF v_changed THEN RAISE EXCEPTION 'FAIL T7: repeat done reported change'; END IF;
  IF EXISTS (SELECT 1 FROM public.get_open_items(current_setting('t.logistics')::uuid)) THEN
    RAISE EXCEPTION 'FAIL T7: done item still open';
  END IF;
  SELECT public.set_message_done('c3000000-0000-0000-0000-0000000000a3', false) INTO v_changed;
  IF NOT EXISTS (SELECT 1 FROM public.get_open_items(current_setting('t.logistics')::uuid)) THEN
    RAISE EXCEPTION 'FAIL T7: reopened item not open';
  END IF;

  -- Turn the setting on for Everyday: the same message becomes completable.
  PERFORM public.set_channel_setting(current_setting('t.everyday')::uuid, 'items_completable', 'true');
  SELECT public.set_message_done('c3000000-0000-0000-0000-0000000000a4', true) INTO v_changed;
  IF NOT v_changed THEN RAISE EXCEPTION 'FAIL T7: setting did not enable done'; END IF;
  PERFORM public.set_channel_setting(current_setting('t.everyday')::uuid, 'items_completable', 'false');
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000a', false);
  RAISE NOTICE 'PASS T7: done-marking is a setting either partner can flip';
END $$;

-- ===== T8: "needs you now" only where allow_urgent is on =====
DO $$
DECLARE v_failed boolean := false; v public.messages;
BEGIN
  BEGIN
    PERFORM public.send_message(gen_random_uuid(), current_setting('t.everyday')::uuid, 'urgent?', 'text', NULL, NULL, true);
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T8: urgent accepted without allow_urgent'; END IF;
  v := public.send_message('c3000000-0000-0000-0000-0000000000a5', current_setting('t.logistics')::uuid,
    'Call me, the car broke down', 'text', NULL, NULL, true);
  IF NOT v.urgent THEN RAISE EXCEPTION 'FAIL T8: urgent flag lost'; END IF;
  RAISE NOTICE 'PASS T8: urgent is gated by the shared allow_urgent setting';
END $$;

-- ===== T9: replies must point inside the couple =====
DO $$
DECLARE v public.messages; v_failed boolean := false;
BEGIN
  v := public.send_message('c3000000-0000-0000-0000-0000000000a6', current_setting('t.everyday')::uuid, 'replying',
    'text', NULL, 'c3000000-0000-0000-0000-0000000000a1');
  IF v.reply_to_id <> 'c3000000-0000-0000-0000-0000000000a1' THEN RAISE EXCEPTION 'FAIL T9: reply lost'; END IF;
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-0000000000e1', false);
  BEGIN
    PERFORM public.send_message(gen_random_uuid(), (SELECT id FROM public.get_channels() LIMIT 1), 'cross reply',
      'text', NULL, 'c3000000-0000-0000-0000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000a', false);
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T9: cross-couple reply accepted'; END IF;
  RAISE NOTICE 'PASS T9: replies stay inside the couple';
END $$;

-- ===== T10: move — "this belongs in heart-to-heart"; author and time kept,
-- origin recorded, both channels' last-message columns re-derived =====
DO $$
DECLARE v public.messages; v_before public.messages; v_changed boolean;
BEGIN
  SELECT * INTO v_before FROM public.messages WHERE id = 'c3000000-0000-0000-0000-0000000000a6';
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000b', false);
  SELECT public.move_message('c3000000-0000-0000-0000-0000000000a6', current_setting('t.heart')::uuid) INTO v_changed;
  IF NOT v_changed THEN RAISE EXCEPTION 'FAIL T10: move not reported'; END IF;
  SELECT * INTO v FROM public.messages WHERE id = 'c3000000-0000-0000-0000-0000000000a6';
  IF v.channel_id <> current_setting('t.heart')::uuid OR v.sender_id <> v_before.sender_id
     OR v.created_at <> v_before.created_at OR v.moved_from_channel_id <> current_setting('t.everyday')::uuid THEN
    RAISE EXCEPTION 'FAIL T10: move did not preserve author/time/origin';
  END IF;
  IF (SELECT last_message_preview FROM public.channels WHERE id = current_setting('t.heart')::uuid) <> 'replying' THEN
    RAISE EXCEPTION 'FAIL T10: target last message not derived';
  END IF;
  IF (SELECT last_message_preview FROM public.channels WHERE id = current_setting('t.everyday')::uuid) <> 'not an item' THEN
    RAISE EXCEPTION 'FAIL T10: source last message not re-derived: %',
      (SELECT last_message_preview FROM public.channels WHERE id = current_setting('t.everyday')::uuid);
  END IF;
  SELECT public.move_message('c3000000-0000-0000-0000-0000000000a6', current_setting('t.heart')::uuid) INTO v_changed;
  IF v_changed THEN RAISE EXCEPTION 'FAIL T10: no-op move reported'; END IF;
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000a', false);
  RAISE NOTICE 'PASS T10: move_message preserves author and time';
END $$;

-- ===== T11: delete — sender only, soft, idempotent, returns the attachment
-- path once =====
DO $$
DECLARE v_path text; v public.messages; v_failed boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000b', false);
  BEGIN
    PERFORM public.delete_message('c3000000-0000-0000-0000-0000000000a2');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T11: partner deleted'; END IF;
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000a', false);
  v_path := public.delete_message('c3000000-0000-0000-0000-0000000000a2');
  IF v_path NOT LIKE '%/photo.jpg' THEN RAISE EXCEPTION 'FAIL T11: path not returned'; END IF;
  IF public.delete_message('c3000000-0000-0000-0000-0000000000a2') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T11: second delete returned a path';
  END IF;
  SELECT * INTO v FROM public.messages WHERE id = 'c3000000-0000-0000-0000-0000000000a2';
  IF v.deleted_at IS NULL OR v.attachment IS NOT NULL OR v.body IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T11: soft delete incomplete';
  END IF;
  RAISE NOTICE 'PASS T11: soft delete, sender only, idempotent';
END $$;

-- ===== T12: keyset paging never skips or repeats =====
DO $$
DECLARE i integer; v_seen integer := 0; v_last public.messages; v_page integer; v_total integer;
BEGIN
  FOR i IN 1..25 LOOP
    PERFORM public.send_message(gen_random_uuid(), current_setting('t.heart')::uuid, 'page ' || i);
  END LOOP;
  SELECT count(*) INTO v_total FROM public.messages WHERE channel_id = current_setting('t.heart')::uuid;
  v_last := NULL;
  LOOP
    SELECT count(*) INTO v_page FROM public.get_messages(current_setting('t.heart')::uuid, v_last.created_at, v_last.id, 10);
    EXIT WHEN v_page = 0;
    v_seen := v_seen + v_page;
    SELECT * INTO v_last FROM public.get_messages(current_setting('t.heart')::uuid, v_last.created_at, v_last.id, 10)
      ORDER BY created_at, id LIMIT 1;
  END LOOP;
  IF v_seen <> v_total THEN RAISE EXCEPTION 'FAIL T12: paged % of %', v_seen, v_total; END IF;
  RAISE NOTICE 'PASS T12: keyset paging covers history exactly once';
END $$;

-- ===== T13: the catch-up feed returns every change after a cursor, in
-- order =====
DO $$
DECLARE v_cursor timestamptz; v_ids uuid[];
BEGIN
  v_cursor := clock_timestamp();
  PERFORM public.edit_message('c3000000-0000-0000-0000-0000000000a1', 'hello again');
  PERFORM public.set_reaction('c3000000-0000-0000-0000-0000000000a3', 'thumbs_up', true);
  SELECT array_agg(id ORDER BY updated_at) INTO v_ids FROM public.get_message_changes(v_cursor);
  IF v_ids <> ARRAY['c3000000-0000-0000-0000-0000000000a1', 'c3000000-0000-0000-0000-0000000000a3']::uuid[] THEN
    RAISE EXCEPTION 'FAIL T13: changes were %', v_ids;
  END IF;
  RAISE NOTICE 'PASS T13: get_message_changes is an ordered catch-up feed';
END $$;

-- ===== T14: RLS — messages are visible inside the couple only, and never
-- writable directly =====
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-0000000000e1', true);
DO $$
DECLARE v_failed boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.messages WHERE couple_id = current_setting('t.couple')::uuid) THEN
    RAISE EXCEPTION 'FAIL T14: outsider reads messages';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_messages(current_setting('t.everyday')::uuid)) THEN
    RAISE EXCEPTION 'FAIL T14: outsider pages history';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_message_changes('-infinity')) THEN
    RAISE EXCEPTION 'FAIL T14: outsider gets the change feed';
  END IF;
  BEGIN
    INSERT INTO public.messages (id, couple_id, channel_id, sender_id, body)
      VALUES (gen_random_uuid(), current_setting('t.couple')::uuid, current_setting('t.everyday')::uuid,
              'c3000000-0000-0000-0000-0000000000e1', 'direct');
  EXCEPTION WHEN insufficient_privilege THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T14: direct insert allowed'; END IF;
END $$;
COMMIT;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v_n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE id = 'c3000000-0000-0000-0000-0000000000a1') THEN
    RAISE EXCEPTION 'FAIL T14: partner cannot read';
  END IF;
  UPDATE public.messages SET body = 'direct edit';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL T14: direct update landed'; END IF;
END $$;
COMMIT;
DO $$ BEGIN RAISE NOTICE 'PASS T14: RLS — couple-only reads, RPC-only writes'; END $$;

-- ===== T15: delete_my_account ends the couple for both =====
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-0000000000f1', false);
  PERFORM public.delete_my_account();
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = 'c3000000-0000-0000-0000-0000000000f1') THEN
    RAISE EXCEPTION 'FAIL T15: auth user survived';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-0000000000e1', false);
  IF EXISTS (SELECT 1 FROM public.get_my_couple()) OR EXISTS (SELECT 1 FROM public.get_channels()) THEN
    RAISE EXCEPTION 'FAIL T15: the remaining partner still has a couple';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = 'c3000000-0000-0000-0000-0000000000e1') THEN
    RAISE EXCEPTION 'FAIL T15: the partner''s own account was deleted';
  END IF;
  RAISE NOTICE 'PASS T15: deleting an account ends the couple; the partner keeps their account';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL MESSAGE TESTS PASSED'; END $$;
