-- Update get_calendar_events to:
-- 1. Return sharer_person_id (the sharer's my_people.id in the recipient's contact list)
--    so the event detail screen can offer a hide action.
-- 2. Exclude events from people the recipient has hidden.
DROP FUNCTION IF EXISTS public.get_calendar_events(uuid, date, date);
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
  sharer_person_id uuid,
  sharer_user_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
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
    mp_owner.id AS sharer_person_id,
    ue.user_id AS sharer_user_id
  FROM public.my_people mp_me
  JOIN public.event_shares es ON es.person_id = mp_me.id
  JOIN public.user_events ue ON ue.id = es.user_event_id
  JOIN public.events e ON e.id = ue.event_id
  LEFT JOIN public.my_people mp_owner ON mp_owner.owner_id = p_user_id AND mp_owner.user_id = ue.user_id
  LEFT JOIN public.hidden_people hp ON hp.owner_id = p_user_id AND hp.person_id = mp_owner.id
  WHERE mp_me.user_id = p_user_id
    AND e.event_date >= p_start_date
    AND e.event_date <= p_end_date
    AND hp.id IS NULL
  ORDER BY e.event_date, e.event_time NULLS LAST;
$$;
