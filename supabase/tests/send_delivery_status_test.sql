-- Functional test of Share Delivery Status storage: sends.sms_sid /
-- sms_status / sms_error_code / sms_status_at (FEATURES.md → Share Delivery
-- Status). The writers are the send-notification edge function and the
-- twilio-status webhook (both service-role, and the webhook's ordering guard
-- lives in Deno) — this suite covers the schema (NULL defaults, CHECK,
-- SID uniqueness) and that the sender can read status through RLS while
-- other users cannot. Impersonation: SET request.jwt.claim.sub (auth.uid()
-- reads it).

\set ON_ERROR_STOP on

-- Cast (fixed UUIDs, 'de' prefix to stay clear of the other suites)
-- users: A=de000000-...-000a  B=de000000-...-000b
-- event: E1 (A) de000000-...-00e1
-- my_people: A->pending1 de000000-...-00c1, A->pending2 de000000-...-00c2

INSERT INTO auth.users (id, phone) VALUES
  ('de000000-0000-0000-0000-00000000000a', '+15555550410'),
  ('de000000-0000-0000-0000-00000000000b', '+15555550411');
-- handle_new_auth_user trigger inserts public.users rows automatically

-- Both contacts stay pending (their phones match no account).
INSERT INTO public.my_people (id, owner_id, phone_number, contact_name) VALUES
  ('de000000-0000-0000-0000-0000000000c1', 'de000000-0000-0000-0000-00000000000a', '+14165550001', 'Pen One'),
  ('de000000-0000-0000-0000-0000000000c2', 'de000000-0000-0000-0000-00000000000a', '+14165550002', 'Pen Two');

-- The scratch DB has no Supabase default privileges; grant what the real
-- project grants so RLS does the filtering.
GRANT SELECT, DELETE ON public.events TO authenticated;
GRANT SELECT ON public.sends TO authenticated;

-- A creates an event and shares it to both contacts (as the client does).
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-00000000000a', true);
SELECT public.save_event(
  'de000000-0000-0000-0000-0000000000e1',
  null, 'Delivery Status Test', null, null, '2026-09-20', '19:00'
);
SELECT public.share_event(
  'de000000-0000-0000-0000-0000000000e1',
  ARRAY['de000000-0000-0000-0000-0000000000c1', 'de000000-0000-0000-0000-0000000000c2']::uuid[]
);
COMMIT;

-- ===== T1: a fresh sends row has NULL status columns (legacy "✓ Shared") =====
DO $$
DECLARE v record;
BEGIN
  SELECT sms_sid, sms_status, sms_error_code, sms_status_at INTO v
    FROM public.sends
    WHERE event_id = 'de000000-0000-0000-0000-0000000000e1'
      AND person_id = 'de000000-0000-0000-0000-0000000000c1';
  IF v.sms_sid IS NOT NULL OR v.sms_status IS NOT NULL
     OR v.sms_error_code IS NOT NULL OR v.sms_status_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T1: expected NULL status columns, got %/%/%/%',
      v.sms_sid, v.sms_status, v.sms_error_code, v.sms_status_at;
  END IF;
  RAISE NOTICE 'PASS T1: fresh sends rows carry NULL delivery status';
END $$;

-- ===== T2: the status CHECK rejects values outside the Twilio ladder =====
DO $$
BEGIN
  UPDATE public.sends SET sms_status = 'bogus'
    WHERE event_id = 'de000000-0000-0000-0000-0000000000e1';
  RAISE EXCEPTION 'FAIL T2: invalid sms_status accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS T2: invalid sms_status rejected';
END $$;

-- ===== T3: the send-time write path (accepted → queued + SID) =====
UPDATE public.sends
  SET sms_sid = 'SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sms_status = 'queued',
      sms_status_at = now()
  WHERE event_id = 'de000000-0000-0000-0000-0000000000e1'
    AND person_id = 'de000000-0000-0000-0000-0000000000c1';

DO $$
DECLARE v record;
BEGIN
  SELECT sms_sid, sms_status INTO v FROM public.sends
    WHERE event_id = 'de000000-0000-0000-0000-0000000000e1'
      AND person_id = 'de000000-0000-0000-0000-0000000000c1';
  IF v.sms_sid IS DISTINCT FROM 'SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
     OR v.sms_status IS DISTINCT FROM 'queued' THEN
    RAISE EXCEPTION 'FAIL T3: send-time write did not land, got %/%', v.sms_sid, v.sms_status;
  END IF;
  RAISE NOTICE 'PASS T3: accepted SMS records SID + queued';
END $$;

-- ===== T4: sms_sid is unique (the webhook's lookup key) =====
DO $$
BEGIN
  UPDATE public.sends SET sms_sid = 'SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    WHERE event_id = 'de000000-0000-0000-0000-0000000000e1'
      AND person_id = 'de000000-0000-0000-0000-0000000000c2';
  RAISE EXCEPTION 'FAIL T4: duplicate sms_sid accepted';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'PASS T4: duplicate sms_sid rejected';
END $$;

-- ===== T5: webhook-style terminal update with an error code =====
UPDATE public.sends
  SET sms_status = 'failed', sms_error_code = '21610', sms_status_at = now()
  WHERE sms_sid = 'SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

DO $$
DECLARE v record;
BEGIN
  SELECT sms_status, sms_error_code INTO v FROM public.sends
    WHERE sms_sid = 'SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  IF v.sms_status IS DISTINCT FROM 'failed' OR v.sms_error_code IS DISTINCT FROM '21610' THEN
    RAISE EXCEPTION 'FAIL T5: terminal update did not land, got %/%', v.sms_status, v.sms_error_code;
  END IF;
  RAISE NOTICE 'PASS T5: terminal state + error code recorded by SID';
END $$;

-- ===== T6: the sender reads delivery status through RLS; others cannot =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-00000000000a', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_status text;
BEGIN
  SELECT sms_status INTO v_status FROM public.sends
    WHERE sms_sid = 'SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  IF v_status IS DISTINCT FROM 'failed' THEN
    RAISE EXCEPTION 'FAIL T6: owner could not read status, got %', v_status;
  END IF;
  RAISE NOTICE 'PASS T6: sender reads delivery status through RLS';
END $$;
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'de000000-0000-0000-0000-00000000000b', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.sends
    WHERE event_id = 'de000000-0000-0000-0000-0000000000e1';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL T6b: non-owner read % sends rows', v_count;
  END IF;
  RAISE NOTICE 'PASS T6b: non-owner sees no sends rows';
END $$;
COMMIT;

DO $$ BEGIN RAISE NOTICE 'ALL SEND-DELIVERY-STATUS TESTS PASSED'; END $$;
