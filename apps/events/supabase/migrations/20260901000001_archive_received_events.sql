-- Archive Received Events (FEATURES.md, spec owner-approved 2026-09-01):
-- removing a RECEIVED event becomes reversible (Archive/Restore); true
-- delete stays for events you created.
--
-- events gains archived_at (NULL = on the calendar). Archiving is neither an
-- edit nor the end of following, so it must NOT go through save_event: a
-- field-changing save sets frozen and cascades, and an archived row keeps
-- following its sender (edits still land; unarchive later and you see
-- current values). The write path is a dedicated idempotent RPC.
--
-- Classification boundary (owner call 2026-09-01): received = from_user_id
-- IS NOT NULL. from_user_id survives the sender deleting their event row
-- (only from_event_id is SET NULL), so a sender-removed received event still
-- shows Archive; when the sender deletes their whole account, from_user_id
-- is scrubbed too and the orphan shows Delete — accepted corner, no
-- provenance flag.

ALTER TABLE public.events ADD COLUMN archived_at timestamptz;

-- set_event_archived: the only write path for archived_at. Owner-only,
-- idempotent by construction — a write matching the current state changes
-- nothing (and never touches updated_at, so a redundant call is invisible
-- to every reader).
CREATE FUNCTION public.set_event_archived(p_event_id uuid, p_archived boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_archived THEN
    UPDATE public.events
      SET archived_at = now()
      WHERE id = p_event_id AND owner_id = v_caller AND archived_at IS NULL;
  ELSE
    UPDATE public.events
      SET archived_at = NULL
      WHERE id = p_event_id AND owner_id = v_caller AND archived_at IS NOT NULL;
  END IF;

  -- Zero rows updated means either already in the desired state (idempotent
  -- no-op) or not the caller's row — only the latter is an error.
  IF NOT FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.events WHERE id = p_event_id AND owner_id = v_caller
    ) THEN
      RAISE EXCEPTION 'Not your event';
    END IF;
  END IF;
END;
$$;

-- get_archived_events: the drawer. Own archived rows, upcoming first
-- (nearest date at top), then past (most recent first). p_today is the
-- caller's LOCAL today so the upcoming/past boundary matches what the user
-- sees. Attribution is the same live from_user_id join as the calendar —
-- but WITHOUT the hidden_people filter: hide filters the calendar, not the
-- drawer (you chose to archive; the drawer is yours).
CREATE FUNCTION public.get_archived_events(p_today date DEFAULT CURRENT_DATE)
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
  sharer_user_id uuid,
  from_user_id uuid,
  archived_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.title, e.description, e.image_url, e.url, e.event_date, e.event_time,
    COALESCE(mp.contact_name, u_from.display_name) AS sharer_contact_name,
    mp.id AS sharer_person_id,
    COALESCE(e.from_user_id, v_caller) AS sharer_user_id,
    e.from_user_id,
    e.archived_at
  FROM public.events e
  LEFT JOIN public.my_people mp
    ON mp.owner_id = v_caller AND mp.user_id = e.from_user_id
  LEFT JOIN public.users u_from
    ON u_from.id = e.from_user_id
  WHERE e.owner_id = v_caller
    AND e.archived_at IS NOT NULL
  ORDER BY
    (e.event_date >= p_today) DESC,
    CASE WHEN e.event_date >= p_today THEN e.event_date END ASC,
    CASE WHEN e.event_date < p_today THEN e.event_date END DESC,
    e.event_time NULLS LAST,
    e.id;
END;
$$;

-- get_calendar_events: archived rows never appear on the calendar (day list
-- or dots). The return also gains the raw from_user_id so the client can
-- classify received vs self-created from a calendar preview alone — before
-- the detail fetch lands — and never offer a working Delete on a received
-- event. DROP (not OR REPLACE) because the return type changes.
DROP FUNCTION public.get_calendar_events(uuid, date, date);

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
  sharer_user_id uuid,
  from_user_id uuid
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
    COALESCE(e.from_user_id, p_user_id) AS sharer_user_id,
    e.from_user_id
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
    AND e.archived_at IS NULL
    AND hp.id IS NULL
  ORDER BY e.event_date, e.event_time NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_event_archived(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_event_archived(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_event_archived(uuid, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_archived_events(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_archived_events(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_archived_events(date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_calendar_events(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_calendar_events(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_calendar_events(uuid, date, date) TO authenticated;
