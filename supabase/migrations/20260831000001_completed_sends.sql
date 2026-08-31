-- Share sheet lock set: people for whom this event is still "sent" as far
-- as the sheet is concerned. A share is a completed action (no unshare) but
-- that is about calendar presence, not send history:
--   * pending contacts (no account) stay locked — they get the copy at signup
--   * app users who still have a copy following this row stay locked
--   * app users who removed their copy drop out, so the sender can share again
-- The sender cannot see other people's events rows through RLS, so this
-- lookup has to be a definer RPC. share_event itself is unchanged: its
-- events INSERT already restores a missing copy (the unique index is empty
-- after a remove); sends stay ON CONFLICT DO NOTHING (Who's Coming + the
-- receipt token survive).

CREATE FUNCTION public.get_completed_sends(p_event_id uuid)
RETURNS TABLE (
  person_id uuid,
  sms_status text,
  sms_error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE id = p_event_id AND owner_id = v_caller
  ) THEN
    RAISE EXCEPTION 'Not your event';
  END IF;

  RETURN QUERY
  SELECT s.person_id, s.sms_status, s.sms_error_code
  FROM public.sends s
  JOIN public.my_people mp
    ON mp.id = s.person_id AND mp.owner_id = v_caller
  WHERE s.event_id = p_event_id
    AND (
      mp.user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.events copy
        WHERE copy.owner_id = mp.user_id
          AND copy.from_event_id = p_event_id
      )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_completed_sends(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_completed_sends(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_completed_sends(uuid) TO authenticated;
