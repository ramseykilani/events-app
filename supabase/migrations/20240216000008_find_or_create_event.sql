-- Server-side dedup: insert a new event or return the existing one if a
-- matching snapshot already exists (same url+title+date+time).
-- Uses SECURITY DEFINER so it can read/write events regardless of RLS,
-- while enforcing that only authenticated users can call it.

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
