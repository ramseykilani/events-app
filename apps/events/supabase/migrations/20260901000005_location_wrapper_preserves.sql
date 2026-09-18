-- Location follow-up: the 7-arg save_event back-compat wrapper from
-- 20260901000004 delegated with p_location = NULL. On CREATE that's right
-- (old clients have no location to give). On EDIT it was a data-loss bug:
-- an old client (installed pre-Location builds, the pre-deploy web app)
-- changing any field would write location = NULL over a value a
-- Location-aware client had set — and cascade the wipe down the follow
-- tree. The wrapper now passes the row's CURRENT location through, so an
-- old-client edit changes only the fields it knows about. (Second-agent
-- review catch, 2026-09-01.)
CREATE OR REPLACE FUNCTION public.save_event(
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
  v_location text;
BEGIN
  -- NULL on the create path (no row yet); the existing value on edit. The
  -- value never leaves this function unless the inner call's ownership
  -- check passes, so the definer read is no disclosure.
  SELECT location INTO v_location FROM public.events WHERE id = p_id;
  RETURN public.save_event(
    p_id, p_url, p_title, p_description, p_image_url, v_location, p_event_date, p_event_time
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_event(uuid, text, text, text, text, date, time) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_event(uuid, text, text, text, text, date, time) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_event(uuid, text, text, text, text, date, time) TO authenticated;
