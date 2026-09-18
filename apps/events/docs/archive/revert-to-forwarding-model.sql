-- REVERT PROCEDURE (data side) — Copy + Follow -> forwarding model.
-- Part of the rollback plan in docs/per-user-events-copy-follow-spec.md
-- (element 6). Read docs/archive/forwarding-model.md first. Never run this
-- from supabase/migrations — it is the reverse of the cutover, applied by
-- hand (psql) only when rolling back.
--
-- Choice rule (spec): soak <= 1 day and few writes -> option A (fast, loses
-- soak-window writes); otherwise option B (reverse-backfill first, lossy:
-- a second sender's row of the same listing collapses into the first under
-- the restored dedup index, losing that attribution; follow links have no
-- legacy home and are discarded).
--
-- The drill (cutover step 3) exercises option B once. The script reads two
-- custom GUCs (set them in the session before running):
--   SET drill.option = 'A'          — skip the reverse-backfill
--   SET drill.option = 'B'          — reverse-backfill first (default when unset)
--   SET revert.cron_command = '<command captured from the pre-cutover pg_dump
--      cron.job row>'              — re-schedules cleanup-events-weekly
-- (the CRON_SECRET lives in that command; never hardcode it here).
--
-- The old function definitions are restored INLINE below (copied verbatim
-- from the forwarding-model-final tag) rather than by re-running the old
-- migration files: 20260807000005_share_event_rpc.sql carries a historical
-- data backfill (re-delivering every recorded share), which a revert must
-- NOT re-run — the reverse-backfill above already rebuilt the pointer table,
-- and re-running it can add pointers that never existed pre-cutover. The
-- legacy tables' RLS policies ride along with the renames (they were never
-- dropped — which is exactly why owns_user_event survived the cutover), so
-- only the dropped/replaced functions need restoring.
-- Then the code revert (git revert of the cutover commit), web redeploy,
-- send-notification redeploy, and cleanup-events redeploy complete the
-- rollback (see the .md for the full checklist).

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Option B only: reverse-backfill the new tables into the legacy ones.
-- ---------------------------------------------------------------------------
-- The new events table holds the COMPLETE current state (the cutover
-- backfilled every pointer into it, and the soak added to it), so the
-- pointer/share tables are rebuilt from it wholesale: clearing first, then
-- backfilling, is what keeps a row edited during the soak from coming back
-- as two calendar entries (the stale pre-cutover pointer plus the edited
-- one). Pointer/share ids are regenerated; created_at is preserved.
-- Documented losses (spec): a second sender's row of the same listing
-- collapses into the first under the restored dedup index (attribution
-- loss), and follow links have no legacy home (discarded).
DO $$
BEGIN
  IF current_setting('drill.option', true) IS DISTINCT FROM 'A' THEN
    DELETE FROM public.legacy_event_shares;
    DELETE FROM public.legacy_user_events;

    -- Snapshots: one per distinct field-set (the restored dedup index
    -- collapses duplicates — accepted attribution loss, documented above).
    INSERT INTO public.legacy_events
      (url, title, description, image_url, event_date, event_time, created_by_user_id, created_at)
    SELECT e.url, e.title, e.description, e.image_url, e.event_date, e.event_time,
           e.owner_id, e.created_at
    FROM public.events e
    ON CONFLICT DO NOTHING;

    -- Pointers: one per new events row, at the snapshot matching its fields.
    INSERT INTO public.legacy_user_events (user_id, event_id, created_at)
    SELECT e.owner_id, le.id, e.created_at
    FROM public.events e
    JOIN public.legacy_events le
      ON COALESCE(le.url, '') = COALESCE(e.url, '')
     AND COALESCE(le.title, '') = COALESCE(e.title, '')
     AND le.event_date = e.event_date
     AND COALESCE(le.event_time::text, '') = COALESCE(e.event_time::text, '')
    ON CONFLICT (user_id, event_id) DO NOTHING;

    -- Sends -> share records on the sender's restored pointer.
    INSERT INTO public.legacy_event_shares (user_event_id, person_id, created_at)
    SELECT ue.id, s.person_id, s.created_at
    FROM public.sends s
    JOIN public.events e ON e.id = s.event_id
    JOIN public.legacy_events le
      ON COALESCE(le.url, '') = COALESCE(e.url, '')
     AND COALESCE(le.title, '') = COALESCE(e.title, '')
     AND le.event_date = e.event_date
     AND COALESCE(le.event_time::text, '') = COALESCE(e.event_time::text, '')
    JOIN public.legacy_user_events ue
      ON ue.user_id = e.owner_id AND ue.event_id = le.id
    ON CONFLICT (user_event_id, person_id) DO NOTHING;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Drop the new model's objects.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_event(uuid, text, text, text, text, date, time);
DROP FUNCTION IF EXISTS public.share_event(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.get_calendar_events(uuid, date, date);
-- deliver_pending_shares is NOT dropped (the my_people trigger depends on the
-- function OID); the old body is restored by re-applying
-- 20260807000006_signup_deliver_pending_shares.sql after this script.
DROP TABLE public.sends;
DROP TABLE public.events;

-- ---------------------------------------------------------------------------
-- Rename the legacy tables back and restore client access (the cutover
-- revoked anon/authenticated).
-- ---------------------------------------------------------------------------
ALTER TABLE public.legacy_events       RENAME TO events;
ALTER TABLE public.legacy_user_events  RENAME TO user_events;
ALTER TABLE public.legacy_event_shares RENAME TO event_shares;

GRANT ALL ON public.events, public.user_events, public.event_shares TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Re-schedule the cleanup-events cron job (the cutover unscheduled it). The
-- command comes from the pre-cutover snapshot — see the header comment.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cmd text := current_setting('revert.cron_command', true);
BEGIN
  IF to_regclass('cron.job') IS NOT NULL AND v_cmd IS NOT NULL AND v_cmd <> '' THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-events-weekly') THEN
      PERFORM cron.schedule('cleanup-events-weekly', '0 4 * * 0', v_cmd);
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Restore the old function bodies (verbatim from the forwarding-model-final
-- tag — see the header comment for why these are inlined).
-- ---------------------------------------------------------------------------

-- find_or_create_event (from 20240216000008_find_or_create_event.sql)
CREATE OR REPLACE FUNCTION public.find_or_create_event(
  p_url text,
  p_title text,
  p_description text,
  p_image_url text,
  p_event_date date,
  p_event_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  BEGIN
    INSERT INTO public.events (
      created_by_user_id, url, title, description, image_url, event_date, event_time
    )
    VALUES (
      v_user_id, p_url, p_title, p_description, p_image_url, p_event_date, p_event_time
    )
    RETURNING id INTO v_event_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_event_id
    FROM public.events
    WHERE COALESCE(url, '') = COALESCE(p_url, '')
      AND COALESCE(title, '') = COALESCE(p_title, '')
      AND event_date = p_event_date
      AND COALESCE(event_time::text, '') = COALESCE(p_event_time::text, '');
  END;

  RETURN v_event_id;
END;
$$;

-- share_event (function body from 20260807000005_share_event_rpc.sql — NOT
-- its historical backfill, see the header comment)
CREATE OR REPLACE FUNCTION public.share_event(p_user_event_id uuid, p_person_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_event_id uuid;
  v_inserted integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- The caller must own the user_event they are sharing from.
  SELECT event_id INTO v_event_id
  FROM public.user_events
  WHERE id = p_user_event_id AND user_id = v_caller;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Not your event';
  END IF;

  -- Record the shares. Person ids must come from the caller's own my_people
  -- list; anything else is ignored. Idempotent via the unique constraint.
  INSERT INTO public.event_shares (user_event_id, person_id)
  SELECT p_user_event_id, pid
  FROM unnest(p_person_ids) AS pid
  WHERE EXISTS (
    SELECT 1 FROM public.my_people mp
    WHERE mp.id = pid AND mp.owner_id = v_caller
  )
  ON CONFLICT (user_event_id, person_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Deliver each recipient their own copy of the snapshot. Contacts without
  -- an account (user_id IS NULL) get theirs when they sign up.
  INSERT INTO public.user_events (user_id, event_id)
  SELECT mp.user_id, v_event_id
  FROM public.my_people mp
  WHERE mp.owner_id = v_caller
    AND mp.id = ANY (p_person_ids)
    AND mp.user_id IS NOT NULL
    AND mp.user_id <> v_caller
  ON CONFLICT (user_id, event_id) DO NOTHING;

  UPDATE public.my_people
  SET last_shared_at = now()
  WHERE owner_id = v_caller AND id = ANY (p_person_ids);

  RETURN v_inserted;
END;
$$;

-- get_calendar_events (final form, from 20260812000002_calendar_display_name.sql)
CREATE FUNCTION public.get_calendar_events(
  p_user_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  title text,
  description text,
  image_url text,
  url text,
  event_date date,
  event_time time,
  sharer_contact_name text,
  sharer_person_id uuid,
  sharer_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Cannot read another user''s calendar';
  END IF;

  RETURN QUERY
  WITH mine AS (
    SELECT ue.id AS user_event_id, ue.event_id AS eid
    FROM public.user_events ue
    WHERE ue.user_id = p_user_id
  ),
  -- Shares of the same snapshot TO the caller, from someone else's copy.
  incoming AS (
    SELECT
      m.user_event_id,
      es.created_at AS shared_at,
      ue_sharer.user_id AS sharer_uid
    FROM mine m
    JOIN public.user_events ue_sharer ON ue_sharer.event_id = m.eid
    JOIN public.event_shares es ON es.user_event_id = ue_sharer.id
    JOIN public.my_people mp_me ON mp_me.id = es.person_id
    WHERE mp_me.user_id = p_user_id
      AND ue_sharer.user_id <> p_user_id
  ),
  -- Most recent share from a non-hidden person, per event. Attribution name:
  -- the caller's own contact_name for the sharer, else the sharer's
  -- display_name (shown only to people they shared with), else NULL.
  attribution AS (
    SELECT DISTINCT ON (i.user_event_id)
      i.user_event_id,
      COALESCE(mp_owner.contact_name, u_sharer.display_name) AS sharer_contact_name,
      mp_owner.id AS sharer_person_id,
      i.sharer_uid
    FROM incoming i
    LEFT JOIN public.my_people mp_owner
      ON mp_owner.owner_id = p_user_id AND mp_owner.user_id = i.sharer_uid
    LEFT JOIN public.users u_sharer
      ON u_sharer.id = i.sharer_uid
    LEFT JOIN public.hidden_people hp
      ON hp.owner_id = p_user_id AND hp.person_id = mp_owner.id
    WHERE hp.id IS NULL
    ORDER BY i.user_event_id, i.shared_at DESC
  )
  SELECT
    m.user_event_id AS id,
    e.id AS event_id,
    e.title,
    e.description,
    e.image_url,
    e.url,
    e.event_date,
    e.event_time,
    a.sharer_contact_name,
    a.sharer_person_id,
    COALESCE(a.sharer_uid, p_user_id) AS sharer_user_id
  FROM mine m
  JOIN public.events e ON e.id = m.eid
  LEFT JOIN attribution a ON a.user_event_id = m.user_event_id
  WHERE e.event_date >= p_start_date
    AND e.event_date <= p_end_date
    AND NOT (
      EXISTS (SELECT 1 FROM incoming i WHERE i.user_event_id = m.user_event_id)
      AND NOT EXISTS (SELECT 1 FROM attribution av WHERE av.user_event_id = m.user_event_id)
    )
  ORDER BY 7, 8 NULLS LAST;
END;
$$;

-- deliver_pending_shares (from 20260807000006_signup_deliver_pending_shares.sql;
-- CREATE OR REPLACE keeps the function OID the my_people trigger references)
CREATE OR REPLACE FUNCTION public.deliver_pending_shares()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    INSERT INTO public.user_events (user_id, event_id)
    SELECT NEW.user_id, ue.event_id
    FROM public.event_shares es
    JOIN public.user_events ue ON ue.id = es.user_event_id
    WHERE es.person_id = NEW.id
    ON CONFLICT (user_id, event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- cleanup_old_events (final form, from 20260807000008_cleanup_orphan_events_only.sql)
CREATE OR REPLACE FUNCTION public.cleanup_old_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.events
  WHERE id NOT IN (SELECT event_id FROM public.user_events);
END;
$$;

-- Match the tag's lockdown: cleanup_old_events is not client-callable.
REVOKE EXECUTE ON FUNCTION public.cleanup_old_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_events() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_events() FROM authenticated;

COMMIT;
