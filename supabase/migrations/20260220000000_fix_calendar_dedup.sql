-- Fix get_calendar_events NOT EXISTS dedup clause.
--
-- The previous NOT EXISTS only checked if the user shared their OWN user_event
-- with a self-contact (mp.user_id = p_user_id).  The correct check is whether
-- the same event already appears in the "shared WITH the user" half of the
-- UNION, i.e. ANY user_event for the same event was shared with a my_people
-- entry that resolves to the current user.

CREATE OR REPLACE FUNCTION public.get_calendar_events(
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
  sharer_user_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Events shared WITH the user
  SELECT
    es.id,
    e.id AS event_id,
    e.title,
    e.description,
    e.image_url,
    e.url,
    e.event_date,
    e.event_time,
    mp_owner.contact_name AS sharer_contact_name,
    ue.user_id AS sharer_user_id
  FROM public.my_people mp_me
  JOIN public.event_shares es ON es.person_id = mp_me.id
  JOIN public.user_events ue ON ue.id = es.user_event_id
  JOIN public.events e ON e.id = ue.event_id
  LEFT JOIN public.my_people mp_owner ON mp_owner.owner_id = p_user_id AND mp_owner.user_id = ue.user_id
  WHERE mp_me.user_id = p_user_id
    AND e.event_date >= p_start_date
    AND e.event_date <= p_end_date

  UNION ALL

  -- Events owned BY the user (excluding any already covered above)
  SELECT
    ue.id,
    e.id AS event_id,
    e.title,
    e.description,
    e.image_url,
    e.url,
    e.event_date,
    e.event_time,
    NULL AS sharer_contact_name,
    ue.user_id AS sharer_user_id
  FROM public.user_events ue
  JOIN public.events e ON e.id = ue.event_id
  WHERE ue.user_id = p_user_id
    AND e.event_date >= p_start_date
    AND e.event_date <= p_end_date
    AND NOT EXISTS (
      SELECT 1
      FROM public.my_people mp_check
      JOIN public.event_shares es_check ON es_check.person_id = mp_check.id
      JOIN public.user_events ue_check ON ue_check.id = es_check.user_event_id
      WHERE mp_check.user_id = p_user_id
        AND ue_check.event_id = ue.event_id
    )

  ORDER BY event_date, event_time NULLS LAST;
$$;
