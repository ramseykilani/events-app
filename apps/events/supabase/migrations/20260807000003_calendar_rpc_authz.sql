-- Harden get_calendar_events:
-- 1. Authorize: the function is SECURITY DEFINER (bypasses RLS), so enforce that
--    callers can only ever read their own calendar.
-- 2. Restore the owned-events half (UNION ALL) dropped by
--    20260330000001_calendar_rpc_hide, keeping the same-event dedup from
--    20260220000000_fix_calendar_dedup and the hidden_people filter.
-- Uses plpgsql so the authz check can raise; ORDER BY uses ordinals to avoid
-- ambiguity with the OUT parameter names.

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
    NULL::text AS sharer_contact_name,
    NULL::uuid AS sharer_person_id,
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

  ORDER BY 7, 8 NULLS LAST;
END;
$$;
