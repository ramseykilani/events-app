-- Channels and the settings registry (FEATURES.md -> Channels, Channel
-- Settings): generic channels, registry-validated settings (shared vs
-- personal, booleans vs choices), presets as starting points, reorder,
-- archive, read positions, partner read receipts gated on the shared
-- setting, and cross-couple isolation under RLS.

\set ON_ERROR_STOP on

-- Two couples ('b2' prefix): A+B and X+Y.
INSERT INTO auth.users (id, phone) VALUES
  ('b2000000-0000-0000-0000-00000000000a', '+15555550310'),
  ('b2000000-0000-0000-0000-00000000000b', '+15555550311'),
  ('b2000000-0000-0000-0000-0000000000e1', '+15555550312'),
  ('b2000000-0000-0000-0000-0000000000f1', '+15555550313');

DO $$
DECLARE v_code text; v record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-00000000000a', false);
  SELECT invite_code INTO v_code FROM public.create_couple();
  PERFORM set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-00000000000b', false);
  SELECT * INTO v FROM public.join_couple(v_code);
  IF v.status <> 'paired' THEN RAISE EXCEPTION 'setup: A+B did not pair'; END IF;
  PERFORM set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-0000000000e1', false);
  SELECT invite_code INTO v_code FROM public.create_couple();
  PERFORM set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-0000000000f1', false);
  SELECT * INTO v FROM public.join_couple(v_code);
  IF v.status <> 'paired' THEN RAISE EXCEPTION 'setup: X+Y did not pair'; END IF;
END $$;

-- Stash A's channel ids by seeded name for later blocks.
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-00000000000a', false);
SELECT set_config('t.everyday', (SELECT id::text FROM public.get_channels() WHERE name = 'Everyday'), false);
SELECT set_config('t.heart', (SELECT id::text FROM public.get_channels() WHERE name = 'Heart-to-heart'), false);
SELECT set_config('t.logistics', (SELECT id::text FROM public.get_channels() WHERE name = 'Logistics'), false);

-- ===== T1: get_channels returns effective settings — every registered key,
-- defaults filled in, presets' values on top =====
DO $$
DECLARE v record; v_keys integer;
BEGIN
  SELECT * INTO v FROM public.get_channels() WHERE id = current_setting('t.everyday')::uuid;
  SELECT count(*) INTO v_keys FROM public.setting_definitions WHERE scope = 'shared';
  IF (SELECT count(*) FROM jsonb_object_keys(v.settings)) <> v_keys THEN
    RAISE EXCEPTION 'FAIL T1: shared settings incomplete: %', v.settings;
  END IF;
  IF v.settings ->> 'read_receipts' <> 'false' OR v.settings ->> 'typing_indicator' <> 'true' THEN
    RAISE EXCEPTION 'FAIL T1: defaults wrong: %', v.settings;
  END IF;
  IF v.my_settings ->> 'notify_level' <> 'notify' OR v.my_settings ->> 'notify_preview' <> 'true' THEN
    RAISE EXCEPTION 'FAIL T1: personal defaults wrong: %', v.my_settings;
  END IF;
  SELECT * INTO v FROM public.get_channels() WHERE id = current_setting('t.heart')::uuid;
  IF v.my_settings ->> 'notify_level' <> 'quiet' OR v.settings ->> 'typing_indicator' <> 'false' THEN
    RAISE EXCEPTION 'FAIL T1: heart preset not applied: % %', v.settings, v.my_settings;
  END IF;
  IF v.unread THEN RAISE EXCEPTION 'FAIL T1: empty channel reads unread'; END IF;
  RAISE NOTICE 'PASS T1: effective settings = registry defaults + preset values';
END $$;

-- ===== T2: set_channel_setting — shared settings are shared, personal ones
-- are yours alone; same-value writes are no-ops =====
DO $$
DECLARE v_changed boolean; v record;
BEGIN
  SELECT public.set_channel_setting(current_setting('t.everyday')::uuid, 'read_receipts', 'true') INTO v_changed;
  IF NOT v_changed THEN RAISE EXCEPTION 'FAIL T2: shared write reported no change'; END IF;
  SELECT public.set_channel_setting(current_setting('t.everyday')::uuid, 'read_receipts', 'true') INTO v_changed;
  IF v_changed THEN RAISE EXCEPTION 'FAIL T2: same-value write reported a change'; END IF;
  SELECT public.set_channel_setting(current_setting('t.everyday')::uuid, 'notify_level', '"none"') INTO v_changed;
  IF NOT v_changed THEN RAISE EXCEPTION 'FAIL T2: personal write reported no change'; END IF;

  PERFORM set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-00000000000b', false);
  SELECT * INTO v FROM public.get_channels() WHERE id = current_setting('t.everyday')::uuid;
  IF v.settings ->> 'read_receipts' <> 'true' THEN RAISE EXCEPTION 'FAIL T2: B does not see the shared change'; END IF;
  IF v.my_settings ->> 'notify_level' <> 'notify' THEN RAISE EXCEPTION 'FAIL T2: A''s mute leaked to B'; END IF;
  PERFORM set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-00000000000a', false);
  RAISE NOTICE 'PASS T2: shared settings apply to both, personal to one; no-op writes report false';
END $$;

-- ===== T3: the registry refuses unknown keys, wrong types and bad choices =====
DO $$
DECLARE v_bad text; v_failed boolean;
BEGIN
  FOREACH v_bad IN ARRAY ARRAY['nope:true', 'read_receipts:"yes"', 'notify_level:"loud"', 'notify_level:true'] LOOP
    v_failed := false;
    BEGIN
      PERFORM public.set_channel_setting(current_setting('t.everyday')::uuid,
        split_part(v_bad, ':', 1), split_part(v_bad, ':', 2)::jsonb);
    EXCEPTION WHEN OTHERS THEN v_failed := true;
    END;
    IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T3: accepted %', v_bad; END IF;
  END LOOP;
  RAISE NOTICE 'PASS T3: unknown keys, wrong types and bad choices are refused';
END $$;

-- ===== T4: the registry shape constraint — a choice default must be one of
-- its options; a boolean carries no options =====
DO $$
DECLARE v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.setting_definitions VALUES ('bad_choice', 'shared', 'choice', ARRAY['a','b'], '"c"', 'x');
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T4: choice default outside options accepted'; END IF;
  v_failed := false;
  BEGIN
    INSERT INTO public.setting_definitions VALUES ('bad_bool', 'shared', 'boolean', ARRAY['a'], 'true', 'x');
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T4: boolean with options accepted'; END IF;
  RAISE NOTICE 'PASS T4: registry rows are well-formed by constraint';
END $$;

-- ===== T5: a new registry row is live for every channel with no data
-- migration; retiring it drops it from effective settings =====
DO $$
DECLARE v record;
BEGIN
  INSERT INTO public.setting_definitions VALUES ('test_toggle', 'shared', 'boolean', NULL, 'true', 'test');
  SELECT * INTO v FROM public.get_channels() WHERE id = current_setting('t.logistics')::uuid;
  IF v.settings ->> 'test_toggle' <> 'true' THEN RAISE EXCEPTION 'FAIL T5: new setting not effective'; END IF;
  PERFORM public.set_channel_setting(current_setting('t.logistics')::uuid, 'test_toggle', 'false');
  DELETE FROM public.setting_definitions WHERE key = 'test_toggle';
  SELECT * INTO v FROM public.get_channels() WHERE id = current_setting('t.logistics')::uuid;
  IF v.settings ? 'test_toggle' THEN RAISE EXCEPTION 'FAIL T5: retired setting still effective'; END IF;
  RAISE NOTICE 'PASS T5: adding or retiring a setting is a registry row';
END $$;

-- ===== T6: create_channel — idempotent on id, from a preset or blank,
-- appended at the end, name validated =====
DO $$
DECLARE v_id uuid := 'b2000000-0000-0000-0000-0000000000c1'; v record; v_failed boolean := false;
BEGIN
  PERFORM public.create_channel(v_id, ' Dreams ', 'moon-outline', 'heart');
  PERFORM public.create_channel(v_id, 'Dreams again', 'moon-outline', 'heart');
  IF (SELECT count(*) FROM public.channels WHERE id = v_id) <> 1 THEN RAISE EXCEPTION 'FAIL T6: duplicate'; END IF;
  SELECT * INTO v FROM public.get_channels() WHERE id = v_id;
  IF v.name <> 'Dreams' OR v.icon <> 'moon-outline' OR v.position <> 4 THEN
    RAISE EXCEPTION 'FAIL T6: wrong row % % %', v.name, v.icon, v.position;
  END IF;
  IF v.my_settings ->> 'notify_level' <> 'quiet' THEN RAISE EXCEPTION 'FAIL T6: preset not applied'; END IF;
  PERFORM public.create_channel('b2000000-0000-0000-0000-0000000000c2', 'Plain', 'leaf-outline');
  SELECT * INTO v FROM public.get_channels() WHERE id = 'b2000000-0000-0000-0000-0000000000c2';
  IF v.settings <> public.effective_settings('shared', '{}') THEN RAISE EXCEPTION 'FAIL T6: blank not default'; END IF;
  BEGIN
    PERFORM public.create_channel(gen_random_uuid(), '   ', 'leaf-outline');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T6: blank name accepted'; END IF;
  RAISE NOTICE 'PASS T6: create_channel is idempotent, preset-aware, validated';
END $$;

-- ===== T7: the partner sees the new channel and gets prefs from the preset =====
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-00000000000b', false);
DO $$
DECLARE v record;
BEGIN
  SELECT * INTO v FROM public.get_channels() WHERE id = 'b2000000-0000-0000-0000-0000000000c1';
  IF NOT FOUND OR v.my_settings ->> 'notify_level' <> 'quiet' THEN
    RAISE EXCEPTION 'FAIL T7: partner did not get the channel with preset prefs';
  END IF;
  RAISE NOTICE 'PASS T7: a new channel arrives for both, with preset prefs for both';
END $$;
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-00000000000a', false);

-- ===== T8: update_channel renames/re-icons; same values are a no-op =====
DO $$
DECLARE v_changed boolean; v_failed boolean := false;
BEGIN
  SELECT public.update_channel('b2000000-0000-0000-0000-0000000000c1', 'Dreams & plans', NULL) INTO v_changed;
  IF NOT v_changed THEN RAISE EXCEPTION 'FAIL T8: rename not reported'; END IF;
  SELECT public.update_channel('b2000000-0000-0000-0000-0000000000c1', 'Dreams & plans', 'moon-outline') INTO v_changed;
  IF v_changed THEN RAISE EXCEPTION 'FAIL T8: no-op reported a change'; END IF;
  BEGIN
    PERFORM public.update_channel('b2000000-0000-0000-0000-0000000000c1', NULL, 'Bad Icon!');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T8: bad icon accepted'; END IF;
  RAISE NOTICE 'PASS T8: update_channel renames and re-icons idempotently';
END $$;

-- ===== T9: reorder — listed ids first in order, the rest keep order =====
DO $$
DECLARE v_names text;
BEGIN
  PERFORM public.reorder_channels(ARRAY[current_setting('t.logistics')::uuid, 'b2000000-0000-0000-0000-0000000000c2'::uuid]);
  SELECT string_agg(name, ',' ORDER BY position) INTO v_names FROM public.get_channels() WHERE archived_at IS NULL;
  IF v_names <> 'Logistics,Plain,Everyday,Heart-to-heart,Dreams & plans' THEN
    RAISE EXCEPTION 'FAIL T9: order %', v_names;
  END IF;
  RAISE NOTICE 'PASS T9: reorder_channels';
END $$;

-- ===== T10: archive is reversible and idempotent; archived channels sort
-- last =====
DO $$
DECLARE v_changed boolean; v_last uuid;
BEGIN
  SELECT public.set_channel_archived('b2000000-0000-0000-0000-0000000000c2', true) INTO v_changed;
  IF NOT v_changed THEN RAISE EXCEPTION 'FAIL T10: archive not reported'; END IF;
  SELECT public.set_channel_archived('b2000000-0000-0000-0000-0000000000c2', true) INTO v_changed;
  IF v_changed THEN RAISE EXCEPTION 'FAIL T10: double archive reported'; END IF;
  SELECT id INTO v_last FROM public.get_channels() OFFSET 4 LIMIT 1;
  IF v_last <> 'b2000000-0000-0000-0000-0000000000c2' THEN RAISE EXCEPTION 'FAIL T10: archived not last'; END IF;
  SELECT public.set_channel_archived('b2000000-0000-0000-0000-0000000000c2', false) INTO v_changed;
  IF NOT v_changed THEN RAISE EXCEPTION 'FAIL T10: restore not reported'; END IF;
  RAISE NOTICE 'PASS T10: archive/restore';
END $$;

-- ===== T11: read positions only move forward and never into the future;
-- partner reads surface only where read_receipts is on =====
DO $$
DECLARE v_at timestamptz;
BEGIN
  PERFORM public.mark_channel_read(current_setting('t.everyday')::uuid, now() + interval '1 day');
  PERFORM public.mark_channel_read(current_setting('t.heart')::uuid, now());
  SELECT last_read_at INTO v_at FROM public.channel_prefs
    WHERE channel_id = current_setting('t.everyday')::uuid AND user_id = 'b2000000-0000-0000-0000-00000000000a';
  IF v_at > now() THEN RAISE EXCEPTION 'FAIL T11: read position in the future'; END IF;
  PERFORM public.mark_channel_read(current_setting('t.everyday')::uuid, now() - interval '1 day');
  IF (SELECT last_read_at FROM public.channel_prefs
      WHERE channel_id = current_setting('t.everyday')::uuid AND user_id = 'b2000000-0000-0000-0000-00000000000a') <> v_at THEN
    RAISE EXCEPTION 'FAIL T11: read position moved backwards';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-00000000000b', false);
  -- Everyday has read_receipts on (T2); Heart-to-heart is off.
  IF NOT EXISTS (SELECT 1 FROM public.get_partner_reads() WHERE channel_id = current_setting('t.everyday')::uuid) THEN
    RAISE EXCEPTION 'FAIL T11: partner read missing where receipts are on';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_partner_reads() WHERE channel_id = current_setting('t.heart')::uuid) THEN
    RAISE EXCEPTION 'FAIL T11: partner read leaked where receipts are off';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-00000000000a', false);
  RAISE NOTICE 'PASS T11: read positions are monotonic; receipts gate the partner''s view';
END $$;

-- ===== T12: cross-couple isolation — RPCs refuse, RLS hides =====
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-0000000000e1', false);
DO $$
DECLARE v_failed boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_channels() WHERE id = current_setting('t.everyday')::uuid) THEN
    RAISE EXCEPTION 'FAIL T12: X lists A''s channel';
  END IF;
  BEGIN
    PERFORM public.set_channel_setting(current_setting('t.everyday')::uuid, 'read_receipts', 'false');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T12: X changed A''s setting'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.reorder_channels(ARRAY[current_setting('t.everyday')::uuid]);
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T12: X reordered A''s channel'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.create_channel(current_setting('t.everyday')::uuid, 'Hijack', 'leaf-outline');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'FAIL T12: X claimed A''s channel id'; END IF;
END $$;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-0000000000e1', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.channels WHERE id = current_setting('t.everyday')::uuid) THEN
    RAISE EXCEPTION 'FAIL T12: RLS shows A''s channel to X';
  END IF;
  IF (SELECT count(*) FROM public.channels) <> 3 THEN RAISE EXCEPTION 'FAIL T12: X sees wrong channel count'; END IF;
  IF EXISTS (SELECT 1 FROM public.channel_prefs WHERE user_id <> 'b2000000-0000-0000-0000-0000000000e1') THEN
    RAISE EXCEPTION 'FAIL T12: prefs of others visible';
  END IF;
  IF (SELECT count(*) FROM public.setting_definitions) = 0 OR (SELECT count(*) FROM public.channel_presets) = 0 THEN
    RAISE EXCEPTION 'FAIL T12: registry/presets unreadable';
  END IF;
END $$;
COMMIT;
DO $$ BEGIN RAISE NOTICE 'PASS T12: channels are invisible and immutable across couples'; END $$;

-- ===== T13: RLS — your partner's prefs (their mute, their read position)
-- are not readable directly =====
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-00000000000b', true);
DO $$
DECLARE v_n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.channel_prefs WHERE user_id = 'b2000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'FAIL T13: partner prefs readable';
  END IF;
  UPDATE public.channels SET name = 'direct';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL T13: direct channel update landed'; END IF;
END $$;
COMMIT;
DO $$ BEGIN RAISE NOTICE 'PASS T13: partner prefs private; no direct channel writes'; END $$;

DO $$ BEGIN RAISE NOTICE 'ALL CHANNEL TESTS PASSED'; END $$;
