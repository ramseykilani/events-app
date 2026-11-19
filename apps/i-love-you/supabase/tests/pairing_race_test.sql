-- Pairing under concurrency, with two real sessions (dblink): the races the
-- single-session pairing_test.sql cannot reach.
--   T1: X created couple A and enters Z's code while Y is redeeming A's code.
--       Y's join commits first; X must not then delete A (and Y with it).
--   T2: two people race one code; exactly one gets in.

\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS dblink;

INSERT INTO auth.users (id, phone) VALUES
  ('a7000000-0000-0000-0000-00000000000a', '+15555550700'),  -- X
  ('a7000000-0000-0000-0000-00000000000b', '+15555550701'),  -- Y
  ('a7000000-0000-0000-0000-00000000000c', '+15555550702'),  -- Z
  ('a7000000-0000-0000-0000-00000000000d', '+15555550703'),  -- racer 1
  ('a7000000-0000-0000-0000-00000000000e', '+15555550704'),  -- racer 2
  ('a7000000-0000-0000-0000-00000000000f', '+15555550705');  -- code owner

-- Couples for X, Z and the code owner, created in this session (committed).
SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-0000-0000-00000000000a', false);
SELECT couple_id AS x_couple, invite_code AS x_code FROM public.create_couple() \gset
SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-0000-0000-00000000000c', false);
SELECT invite_code AS z_code FROM public.create_couple() \gset
SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-0000-0000-00000000000f', false);
SELECT invite_code AS f_code FROM public.create_couple() \gset

SELECT dblink_connect('y', 'dbname=' || current_database());
SELECT dblink_connect('x', 'dbname=' || current_database());

-- ===== T1 =====
-- Y joins A inside an open transaction (holds A's row lock, not committed).
SELECT dblink_exec('y', 'BEGIN');
SELECT * FROM dblink('y', $q$SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-0000-0000-00000000000b', false)$q$) AS t(v text);
SELECT * FROM dblink('y', format('SELECT status FROM public.join_couple(%L)', :'x_code')) AS t(status text);
-- X enters Z's code: reads A as unpaired, then blocks on A's row.
SELECT * FROM dblink('x', $q$SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-0000-0000-00000000000a', false)$q$) AS t(v text);
SELECT dblink_send_query('x', format('SELECT status FROM public.join_couple(%L)', :'z_code'));
SELECT pg_sleep(0.5);
SELECT dblink_exec('y', 'COMMIT');
SELECT status AS x_status FROM dblink_get_result('x') AS t(status text) \gset
SELECT * FROM dblink_get_result('x') AS t(status text);

DO $$
DECLARE v_y record;
BEGIN
  SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-0000-0000-00000000000b', true) INTO STRICT v_y;
  IF NOT EXISTS (SELECT 1 FROM public.get_my_couple() WHERE paired_at IS NOT NULL
                 AND partner_id = 'a7000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'FAIL T1: Y was told paired but has no couple with X';
  END IF;
  IF (SELECT count(*) FROM public.get_channels()) <> 3 THEN
    RAISE EXCEPTION 'FAIL T1: Y''s seeded channels are gone';
  END IF;
  IF EXISTS (SELECT 1 FROM public.couple_members cm JOIN public.couples c ON c.id = cm.couple_id
             WHERE c.invite_code IS NULL AND cm.user_id = 'a7000000-0000-0000-0000-00000000000c'
             AND c.paired_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL T1: X also paired with Z';
  END IF;
  RAISE NOTICE 'PASS T1: a creator joining elsewhere cannot delete the couple that just paired';
END $$;
SELECT CASE WHEN :'x_status' = 'already_paired' THEN 'ok' END AS t1_status \gset
\if :{?t1_status}
\else
DO $$ BEGIN RAISE EXCEPTION 'FAIL T1: X should be told already_paired'; END $$;
\endif

-- ===== T2 =====
SELECT * FROM dblink('y', $q$SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-0000-0000-00000000000d', false)$q$) AS t(v text);
SELECT * FROM dblink('x', $q$SELECT set_config('request.jwt.claim.sub', 'a7000000-0000-0000-0000-00000000000e', false)$q$) AS t(v text);
SELECT dblink_exec('y', 'BEGIN');
SELECT * FROM dblink('y', format('SELECT status FROM public.join_couple(%L)', :'f_code')) AS t(status text);
SELECT dblink_send_query('x', format('SELECT status FROM public.join_couple(%L)', :'f_code'));
SELECT pg_sleep(0.5);
SELECT dblink_exec('y', 'COMMIT');
SELECT * FROM dblink_get_result('x') AS t(status text);
SELECT * FROM dblink_get_result('x') AS t(status text);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.couple_members cm JOIN public.couples c ON c.id = cm.couple_id
      WHERE c.created_by = 'a7000000-0000-0000-0000-00000000000f') <> 2 THEN
    RAISE EXCEPTION 'FAIL T2: the raced couple does not have exactly two members';
  END IF;
  IF EXISTS (SELECT 1 FROM public.couple_members WHERE user_id = 'a7000000-0000-0000-0000-00000000000e') THEN
    RAISE EXCEPTION 'FAIL T2: the second racer got in';
  END IF;
  RAISE NOTICE 'PASS T2: two people racing one code: exactly one gets in';
END $$;

SELECT dblink_disconnect('y');
SELECT dblink_disconnect('x');
\echo ALL PAIRING RACE TESTS PASSED
