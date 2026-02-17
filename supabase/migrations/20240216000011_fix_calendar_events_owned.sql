-- Fix get_calendar_events to include events owned by the user, not just shared with them.
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

  -- Events owned BY the user
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
    -- Avoid duplicates if an event is shared with the owner (though UI usually prevents this)
    AND NOT EXISTS (
      SELECT 1 FROM public.event_shares es
      JOIN public.my_people mp ON mp.id = es.person_id
      WHERE es.user_event_id = ue.id AND mp.user_id = p_user_id
    )

  ORDER BY event_date, event_time NULLS LAST;
$$;
