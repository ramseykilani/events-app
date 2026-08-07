-- Forwarding semantics: the calendar is built from your own copies.
--
-- Before: shared events came from the sharer's user_events row, so a sharer
-- removing their copy changed recipients' calendars. Now every event on the
-- calendar is one of the caller's own user_events rows; event_shares is only
-- used for attribution ("Shared by X") and the hide filter.
--
-- Attribution: the most recent incoming share of the same snapshot from a
-- person the caller has not hidden. Hiding a person suppresses events whose
-- ONLY incoming shares are from hidden people; events you added yourself (no
-- incoming shares) are always shown.

DROP FUNCTION IF EXISTS public.get_calendar_events(uuid, date, date);

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
  -- Most recent share from a non-hidden person, per event.
  attribution AS (
    SELECT DISTINCT ON (i.user_event_id)
      i.user_event_id,
      mp_owner.contact_name AS sharer_contact_name,
      mp_owner.id AS sharer_person_id,
      i.sharer_uid
    FROM incoming i
    LEFT JOIN public.my_people mp_owner
      ON mp_owner.owner_id = p_user_id AND mp_owner.user_id = i.sharer_uid
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
