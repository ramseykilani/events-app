-- Functional test of notification preferences: notify_push / notify_sms on
-- public.users. Defaults true (existing behavior), writable by the owner,
-- NOT NULL enforced. The send-notification gating itself lives in the edge
-- function (Deno) and is covered by live verification, not this suite.
-- Impersonation: SET request.jwt.claim.sub to the user's uuid (auth.uid() reads it).

\set ON_ERROR_STOP on

-- Cast (fixed UUIDs, 'ab' prefix to stay clear of the other suites)
-- users: A=ab000000-...-000a  B=ab000000-...-000b

INSERT INTO auth.users (id, phone) VALUES
  ('ab000000-0000-0000-0000-00000000000a', '+15555550400'),
  ('ab000000-0000-0000-0000-00000000000b', '+15555550401');
-- handle_new_auth_user trigger inserts public.users rows automatically

-- ===== T1: new accounts default to both channels on =====
DO $$
DECLARE v record;
BEGIN
  SELECT notify_push, notify_sms INTO v FROM public.users
    WHERE id = 'ab000000-0000-0000-0000-00000000000a';
  IF v.notify_push IS NOT true OR v.notify_sms IS NOT true THEN
    RAISE EXCEPTION 'FAIL T1: expected defaults true/true, got %/%', v.notify_push, v.notify_sms;
  END IF;
  RAISE NOTICE 'PASS T1: new accounts default to push + SMS on';
END $$;

-- ===== T2: the owner can flip each pref independently =====
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-00000000000a', true);
UPDATE public.users SET notify_push = false WHERE id = 'ab000000-0000-0000-0000-00000000000a';
COMMIT;

DO $$
DECLARE v record;
BEGIN
  SELECT notify_push, notify_sms INTO v FROM public.users
    WHERE id = 'ab000000-0000-0000-0000-00000000000a';
  IF v.notify_push IS NOT false OR v.notify_sms IS NOT true THEN
    RAISE EXCEPTION 'FAIL T2: expected false/true after push toggle, got %/%', v.notify_push, v.notify_sms;
  END IF;
  RAISE NOTICE 'PASS T2: push off leaves SMS on';
END $$;

BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-00000000000a', true);
UPDATE public.users SET notify_push = true, notify_sms = false WHERE id = 'ab000000-0000-0000-0000-00000000000a';
COMMIT;

DO $$
DECLARE v record;
BEGIN
  SELECT notify_push, notify_sms INTO v FROM public.users
    WHERE id = 'ab000000-0000-0000-0000-00000000000a';
  IF v.notify_push IS NOT true OR v.notify_sms IS NOT false THEN
    RAISE EXCEPTION 'FAIL T2b: expected true/false after SMS toggle, got %/%', v.notify_push, v.notify_sms;
  END IF;
  RAISE NOTICE 'PASS T2b: SMS off leaves push on';
END $$;

-- ===== T3: one user's toggles never touch another user's row =====
DO $$
DECLARE v record;
BEGIN
  SELECT notify_push, notify_sms INTO v FROM public.users
    WHERE id = 'ab000000-0000-0000-0000-00000000000b';
  IF v.notify_push IS NOT true OR v.notify_sms IS NOT true THEN
    RAISE EXCEPTION 'FAIL T3: B prefs drifted to %/%', v.notify_push, v.notify_sms;
  END IF;
  RAISE NOTICE 'PASS T3: other accounts unaffected';
END $$;

-- ===== T4: NOT NULL is enforced (prefs are never ambiguous) =====
DO $$
BEGIN
  UPDATE public.users SET notify_push = NULL WHERE id = 'ab000000-0000-0000-0000-00000000000a';
  RAISE EXCEPTION 'FAIL T4: NULL notify_push accepted';
EXCEPTION WHEN not_null_violation THEN
  RAISE NOTICE 'PASS T4: NULL notify_push rejected';
END $$;

DO $$
BEGIN
  UPDATE public.users SET notify_sms = NULL WHERE id = 'ab000000-0000-0000-0000-00000000000a';
  RAISE EXCEPTION 'FAIL T4b: NULL notify_sms accepted';
EXCEPTION WHEN not_null_violation THEN
  RAISE NOTICE 'PASS T4b: NULL notify_sms rejected';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL NOTIFICATION-PREFS TESTS PASSED'; END $$;
