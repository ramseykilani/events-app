-- Forwarding semantics: sharing hands the recipient their own copy.
--
-- Before: recipients saw shared events through the sharer's user_events row
-- (via event_shares). If the sharer later removed the event, every direct
-- recipient who had never re-shared lost it — whether an event survived on
-- your calendar depended on what the recipient did, not on a coherent rule.
--
-- Now: share_event delivers each recipient their own user_events row (their
-- independent copy of the same immutable snapshot) at share time. A share is
-- a completed action, like forwarding a text — it cannot be unsent. Removing
-- an event from your calendar only ever affects your calendar.
--
-- event_shares remains as the share record: it drives the "Shared with"
-- list, notifications, and pending delivery for contacts without an account
-- (their copies are delivered on sign-up — see
-- 20260807000006_signup_deliver_pending_shares.sql).

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

-- Backfill: every existing share to a contact who has an account becomes
-- that recipient's own copy.
INSERT INTO public.user_events (user_id, event_id)
SELECT DISTINCT mp.user_id, ue.event_id
FROM public.event_shares es
JOIN public.user_events ue ON ue.id = es.user_event_id
JOIN public.my_people mp ON mp.id = es.person_id
WHERE mp.user_id IS NOT NULL
  AND mp.user_id <> ue.user_id
ON CONFLICT (user_id, event_id) DO NOTHING;

-- Recipients now read events through their own user_events row. Without an
-- ownership path here, a recipient whose sharer removed their copy (which
-- cascades the event_shares row the old policy relied on) would lose read
-- access to an event they own.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'events_select_owner') THEN
    CREATE POLICY "events_select_owner" ON public.events FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.user_events ue
        WHERE ue.event_id = events.id AND ue.user_id = auth.uid()
      )
    );
  END IF;
END $$;
