-- Per-User Events (Copy + Follow): replace the snapshot/pointer/share-log
-- model with per-user event rows that follow their sender until edited.
--
-- Spec: docs/per-user-events-copy-follow-spec.md (owner-approved 2026-08-21).
-- Client and backend move together — there is no dual-write period.
--
-- Before: events = global immutable snapshots (deduped on url+title+date+
-- time), user_events = per-user pointers, event_shares = a share log that
-- doubled as the attribution/hide mechanism. That shape forced fork-on-edit,
-- the five-call client-side save (the B-1 bug class), KI-002 (global dedup
-- drops description/image), disappearing "From X" attribution, and the
-- re-share-after-edit double copy.
--
-- After: events = a row on YOUR calendar (owner-scoped id, listing fields,
-- from_event_id/from_user_id provenance, frozen flag). sends = who you told
-- (share-sheet ✓ Shared, "Shared with", notifications, pending delivery).
-- Edits are one save_event call: update your row, mark it frozen, and
-- cascade the new values to every row still following it (silently — no
-- notifications, owner decision 2026-08-21).
--
-- Rollback: the old tables are RENAMED, not dropped (30-day soak window);
-- the full plan (restore point, snapshot, rehearsal, revert procedure) is in
-- the spec's Rollback section.

-- ============================================================================
-- 0. Rename, don't drop (rollback element 3).
-- ============================================================================
ALTER TABLE public.events       RENAME TO legacy_events;
ALTER TABLE public.user_events  RENAME TO legacy_user_events;
ALTER TABLE public.event_shares RENAME TO legacy_event_shares;

-- No client path may read stale data during the soak window.
REVOKE ALL ON public.legacy_events, public.legacy_user_events, public.legacy_event_shares
  FROM anon, authenticated;

-- ============================================================================
-- 1. Drop the objects the new model replaces.
-- ============================================================================
-- Replaced by save_event (create + edit in one idempotent call).
DROP FUNCTION IF EXISTS public.find_or_create_event(text, text, text, text, date, time);
-- No orphan snapshots exist in this model — every row has exactly one owner,
-- and removing a row is final. The cleanup-events edge function and its
-- pg_cron job go with it (edge function deleted at deploy time; cron job
-- unscheduled below).
DROP FUNCTION IF EXISTS public.cleanup_old_events();
-- owns_user_event was for event_shares RLS recursion; the NEW policies have
-- no cross-table recursion and never call it. It is NOT dropped here: the
-- renamed legacy_event_shares policies still depend on it, and the rollback
-- plan needs those policies intact (renaming the legacy tables back must
-- restore the exact pre-cutover state). It dies with the legacy tables in
-- the post-soak drop migration.
-- The global dedup index dies with the legacy_events rename (nothing inserts
-- there post-cutover).
-- Re-pointed at the new tables below. DROP (not OR REPLACE) because the
-- parameter names change (p_user_event_id -> p_event_id) and the calendar
-- RPC's return type changes (the dual id collapses to the row id).
DROP FUNCTION IF EXISTS public.share_event(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.get_calendar_events(uuid, date, date);

-- Unschedule the cleanup-events cron job (defensive: only when pg_cron and
-- the job exist; the scratch test DB has neither). Runbook fallback: SQL
-- editor.
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-events-weekly') THEN
      PERFORM cron.unschedule('cleanup-events-weekly');
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 2. New events — a row on your calendar.
-- ============================================================================
CREATE TABLE public.events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  url           text,
  title         text,
  description   text,
  image_url     text,
  event_date    date NOT NULL,
  event_time    time,
  -- Where this copy came from. NULL = you created it (or the link was
  -- lost/cleared — see remove/delete-account semantics).
  from_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  -- The sender's account, for attribution + hide. SET NULL when the sender
  -- deletes their account (attribution disappears — same as the old model).
  from_user_id  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- You edited this; stop following from_event_id.
  frozen        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_url_or_title CHECK (url IS NOT NULL OR title IS NOT NULL)
);

CREATE INDEX idx_events_owner_date ON public.events(owner_id, event_date);
CREATE INDEX idx_events_from_event_id ON public.events(from_event_id)
  WHERE from_event_id IS NOT NULL;
-- One copy per sender-row per recipient: a re-share from the same sender row
-- cannot plant a second row. Two different senders still yield two rows
-- (owner decision 3).
CREATE UNIQUE INDEX idx_events_one_copy_per_sender_row
  ON public.events(owner_id, from_event_id) WHERE from_event_id IS NOT NULL;

-- ============================================================================
-- 3. New sends — who you told.
-- ============================================================================
CREATE TABLE public.sends (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES public.my_people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, person_id)
);

CREATE INDEX idx_sends_person_id ON public.sends(person_id);

-- ============================================================================
-- 4. RLS — the entire access model collapses to ownership. All cross-user
--    writes (recipient copies, follow cascades) happen only inside SECURITY
--    DEFINER functions.
-- ============================================================================
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sends   ENABLE ROW LEVEL SECURITY;

-- Reads and removes are direct client operations. Creates and edits go
-- through save_event so the frozen/cascade logic cannot be bypassed.
CREATE POLICY events_select_own ON public.events FOR SELECT
  USING (owner_id = auth.uid());
CREATE POLICY events_delete_own ON public.events FOR DELETE
  USING (owner_id = auth.uid());

-- sends are written only by share_event / deliver_pending_shares (definer);
-- the client reads them for ✓ Shared and "Shared with".
CREATE POLICY sends_select_owner ON public.sends FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = sends.event_id AND e.owner_id = auth.uid()
  ));

-- ============================================================================
-- 5. RPCs. All SECURITY DEFINER with the delete_my_account hardening pattern
--    (EXECUTE revoked from PUBLIC/anon, granted to authenticated).
-- ============================================================================

-- save_event: one entry point for create and edit. The client generates the
-- id for new events (crypto.randomUUID()), which makes both paths naturally
-- idempotent — a timed-out call retried with the same arguments is always
-- safe, killing the B-1 failure mode by construction rather than by budget
-- tuning.
CREATE FUNCTION public.save_event(
  p_id uuid,
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
  v_caller uuid := auth.uid();
  v_existing public.events;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_existing FROM public.events WHERE id = p_id;

  IF NOT FOUND THEN
    -- Create path. A retry of an aborted create finds the row and falls
    -- through to the no-op check below instead of double-creating.
    INSERT INTO public.events
      (id, owner_id, url, title, description, image_url, event_date, event_time)
    VALUES
      (p_id, v_caller, p_url, p_title, p_description, p_image_url, p_event_date, p_event_time);
    RETURN p_id;
  END IF;

  IF v_existing.owner_id <> v_caller THEN
    RAISE EXCEPTION 'Not your event';
  END IF;

  -- No-op rule: a save that changes nothing does NOT end following and
  -- does not cascade. (Also what makes create-retries side-effect-free.)
  IF v_existing.url         IS NOT DISTINCT FROM p_url
     AND v_existing.title       IS NOT DISTINCT FROM p_title
     AND v_existing.description IS NOT DISTINCT FROM p_description
     AND v_existing.image_url   IS NOT DISTINCT FROM p_image_url
     AND v_existing.event_date  IS NOT DISTINCT FROM p_event_date
     AND v_existing.event_time  IS NOT DISTINCT FROM p_event_time THEN
    RETURN p_id;
  END IF;

  -- Edit path: any change ends following (owner decision 2)...
  UPDATE public.events
  SET url = p_url, title = p_title, description = p_description,
      image_url = p_image_url, event_date = p_event_date, event_time = p_event_time,
      frozen = true, updated_at = now()
  WHERE id = p_id;

  -- ...then propagate to every row still following this one, walking the
  -- follow tree. UNION (not UNION ALL) dedupes visited ids, so a row is
  -- never updated twice and a cycle terminates by construction. The walk
  -- only descends through non-frozen rows, so a frozen intermediary prunes
  -- its whole subtree from this cascade.
  WITH RECURSIVE descendants AS (
    SELECT id FROM public.events
    WHERE from_event_id = p_id AND NOT frozen
    UNION
    SELECT e.id FROM public.events e
    JOIN descendants d ON e.from_event_id = d.id
    WHERE NOT e.frozen
  )
  UPDATE public.events e
  SET url = p_url, title = p_title, description = p_description,
      image_url = p_image_url, event_date = p_event_date, event_time = p_event_time,
      updated_at = now()
  FROM descendants d
  -- AND NOT e.frozen is load-bearing, not redundant with the CTE: the CTE is
  -- evaluated once at the statement snapshot, but this outer predicate is
  -- what EvalPlanQual re-evaluates on the new row version after a lock wait
  -- (see Concurrency in the spec).
  WHERE e.id = d.id AND NOT e.frozen;

  RETURN p_id;
END;
$$;

-- share_event: same contract as the old RPC (returns the count of newly
-- recorded sends), re-pointed at the new tables. Sharing copies YOUR current
-- row onto each recipient's calendar.
CREATE FUNCTION public.share_event(p_event_id uuid, p_person_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_row public.events;
  v_inserted integer;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM public.events
  WHERE id = p_event_id AND owner_id = v_caller;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not your event'; END IF;

  -- Record the sends (own contacts only; idempotent).
  INSERT INTO public.sends (event_id, person_id)
  SELECT p_event_id, pid
  FROM unnest(p_person_ids) AS pid
  WHERE EXISTS (
    SELECT 1 FROM public.my_people mp
    WHERE mp.id = pid AND mp.owner_id = v_caller
  )
  ON CONFLICT (event_id, person_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Deliver each app-user recipient their own copy of MY row as it is now.
  -- Contacts without an account get theirs at sign-up (deliver_pending_shares).
  INSERT INTO public.events
    (owner_id, url, title, description, image_url, event_date, event_time,
     from_event_id, from_user_id)
  SELECT mp.user_id, v_row.url, v_row.title, v_row.description, v_row.image_url,
         v_row.event_date, v_row.event_time, p_event_id, v_caller
  FROM public.my_people mp
  WHERE mp.owner_id = v_caller
    AND mp.id = ANY (p_person_ids)
    AND mp.user_id IS NOT NULL
    AND mp.user_id <> v_caller
  ON CONFLICT (owner_id, from_event_id) WHERE from_event_id IS NOT NULL DO NOTHING;

  UPDATE public.my_people SET last_shared_at = now()
  WHERE owner_id = v_caller AND id = ANY (p_person_ids);

  RETURN v_inserted;
END;
$$;

-- get_calendar_events: own rows only; attribution and hide resolve through a
-- live join on from_user_id. The return shape drops the old dual id — id is
-- now the event row itself.
CREATE FUNCTION public.get_calendar_events(
  p_user_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  id uuid,
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
  SELECT
    e.id,
    e.title, e.description, e.image_url, e.url, e.event_date, e.event_time,
    COALESCE(mp.contact_name, u_from.display_name) AS sharer_contact_name,
    mp.id AS sharer_person_id,
    COALESCE(e.from_user_id, p_user_id) AS sharer_user_id
  FROM public.events e
  LEFT JOIN public.my_people mp
    ON mp.owner_id = p_user_id AND mp.user_id = e.from_user_id
  LEFT JOIN public.users u_from
    ON u_from.id = e.from_user_id
  LEFT JOIN public.hidden_people hp
    ON hp.owner_id = p_user_id AND hp.person_id = mp.id
  WHERE e.owner_id = p_user_id
    AND e.event_date >= p_start_date
    AND e.event_date <= p_end_date
    AND hp.id IS NULL
  ORDER BY e.event_date, e.event_time NULLS LAST;
END;
$$;

-- deliver_pending_shares: same trigger point (AFTER UPDATE OF user_id ON
-- my_people). Pending copies are stamped from the sender's row AS IT IS AT
-- SIGN-UP, so pre-sign-up edits are simply included. If the sender removed
-- their row (or deleted their account) first, the sends row cascaded away
-- with it and nothing is delivered — same as the old model.
CREATE OR REPLACE FUNCTION public.deliver_pending_shares()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    INSERT INTO public.events
      (owner_id, url, title, description, image_url, event_date, event_time,
       from_event_id, from_user_id)
    SELECT NEW.user_id, s.url, s.title, s.description, s.image_url,
           s.event_date, s.event_time, s.id, s.owner_id
    FROM public.sends sd
    JOIN public.events s ON s.id = sd.event_id
    WHERE sd.person_id = NEW.id
      AND s.owner_id <> NEW.user_id
    ON CONFLICT (owner_id, from_event_id) WHERE from_event_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_event(uuid, text, text, text, text, date, time) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_event(uuid, text, text, text, text, date, time) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_event(uuid, text, text, text, text, date, time) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.share_event(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.share_event(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.share_event(uuid, uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_calendar_events(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_calendar_events(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_calendar_events(uuid, date, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.deliver_pending_shares() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deliver_pending_shares() FROM anon;
GRANT EXECUTE ON FUNCTION public.deliver_pending_shares() TO authenticated;

-- ============================================================================
-- 6. Backfill. Data volume is tiny (internal testing), so the row-by-row
--    loop is deliberate — readable and exactly correct, no set-based
--    cleverness. (Plain TEMP TABLE, dropped explicitly at the end: an
--    ON COMMIT DROP table would vanish after the first statement when the
--    file is piped through psql in autocommit mode, e.g. the local SQL test
--    harness and the rehearsal.)
-- ============================================================================
CREATE TEMP TABLE _ue_map (
  legacy_ue_id uuid PRIMARY KEY,
  new_event_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  legacy_snapshot_id uuid NOT NULL
);

-- 6.1. One new events row per legacy_user_events row, fields from its
--      snapshot. The temp map ties each legacy pointer to its new row for
--      steps 6.2-6.3.
DO $$
DECLARE
  r record;
  v_new_id uuid;
BEGIN
  FOR r IN
    SELECT ue.id AS ue_id, ue.user_id AS ue_user_id, ue.created_at AS ue_created_at, e.*
    FROM legacy_user_events ue
    JOIN legacy_events e ON e.id = ue.event_id
  LOOP
    INSERT INTO public.events
      (owner_id, url, title, description, image_url, event_date, event_time, created_at, updated_at)
    VALUES
      (r.ue_user_id, r.url, r.title, r.description, r.image_url, r.event_date, r.event_time,
       r.ue_created_at, r.ue_created_at)
    RETURNING id INTO v_new_id;
    INSERT INTO _ue_map VALUES (r.ue_id, v_new_id, r.ue_user_id, r.id);
  END LOOP;
END $$;

-- 6.2. Every legacy_event_shares row becomes a sends line on the SENDER's
--      new row.
INSERT INTO public.sends (event_id, person_id, created_at)
SELECT m.new_event_id, es.person_id, es.created_at
FROM legacy_event_shares es
JOIN _ue_map m ON m.legacy_ue_id = es.user_event_id;

-- 6.3. Follow links: exact snapshot match only. A recipient copy links to
--      the sender's new row only when the recipient's copy is of the
--      snapshot the sender's pointer references NOW (i.e. the sender never
--      forked after sharing). Forked shares backfill as independent rows
--      (from_* NULL) — the fork graph is lossy and we do not guess. When
--      several senders' shares match one recipient copy (the old shared-
--      snapshot case), the most recent share wins the link, matching the old
--      DISTINCT ON attribution; the other senders keep their sends lines
--      from step 6.2.
WITH candidate AS (
  SELECT DISTINCT ON (mr.new_event_id)
    mr.new_event_id  AS recipient_new_id,
    ms.new_event_id  AS sender_new_id,
    ue_s.user_id     AS sender_user_id
  FROM legacy_event_shares es
  JOIN legacy_user_events ue_s ON ue_s.id = es.user_event_id
  JOIN _ue_map ms ON ms.legacy_ue_id = ue_s.id
  JOIN public.my_people mp ON mp.id = es.person_id
  JOIN legacy_user_events ue_r
    ON ue_r.user_id = mp.user_id AND ue_r.event_id = ue_s.event_id
  JOIN _ue_map mr ON mr.legacy_ue_id = ue_r.id
  WHERE mp.user_id IS NOT NULL
    AND mp.user_id <> ue_s.user_id
  ORDER BY mr.new_event_id, es.created_at DESC
)
UPDATE public.events e
SET from_event_id = c.sender_new_id,
    from_user_id  = c.sender_user_id
FROM candidate c
WHERE e.id = c.recipient_new_id;

-- All backfilled rows are frozen = false (the default). Rows with
-- from_event_id NULL follow nothing, so there is nothing to freeze from.
-- Pending contacts (no account) get no row — their sends lines from step
-- 6.2 deliver at sign-up via the new trigger, stamped with the sender's
-- current values at that moment. Self-shares are excluded everywhere,
-- matching the old model.

DROP TABLE _ue_map;
