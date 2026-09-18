-- Who's Coming (FEATURES.md): every send carries a yes/no response slot.
-- The response hangs off the SEND, not the event — this person answered the
-- person who asked them. It is not a guest list on "the event", not hosted,
-- and only the asker ever sees it (a forward is a new ask, answered to the
-- forwarder). Yes/no only — no maybe; NULL means they haven't said; last
-- write wins.
--
-- sends gains:
--   response       — 'yes' | 'no' | NULL (unanswered)
--   responded_at   — when the current answer was set (the asker-push edge
--                    function uses its freshness to reject replayed invokes)
--   response_token — capability for the SMS receipt page (send-response edge
--                    function; the page is the only non-JWT writer). One per
--                    send, stable across re-shares because share_event is
--                    ON CONFLICT DO NOTHING — the same link keeps working
--                    after a later invite text arrives.
--
-- Reads ride the existing sends_select_owner policy (the asker sees answers
-- on "Shared with"); recipients have no RLS path to another user's sends —
-- they read/write their own answer only through the two definer RPCs below.

ALTER TABLE public.sends
  ADD COLUMN response text,
  ADD COLUMN responded_at timestamptz,
  ADD COLUMN response_token uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.sends
  ADD CONSTRAINT sends_response_check CHECK (response IN ('yes', 'no'));

CREATE UNIQUE INDEX idx_sends_response_token ON public.sends(response_token);

-- respond_to_send: the recipient's only write path onto the sender's send
-- row. p_event_id is the caller's OWN events row (the copy they received);
-- the send resolves through it: the sender's row id is from_event_id, and
-- the sender's contact entry for the caller is the my_people row with
-- owner_id = from_user_id, user_id = caller (at most one — my_people is
-- UNIQUE(owner_id, phone_number)). Returns whether the stored answer
-- CHANGED — the client invokes send-response-notification only then, so
-- opening the page and leaving it never pings the asker, and a flip
-- (yes -> no) always does.
CREATE FUNCTION public.respond_to_send(p_event_id uuid, p_response text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_row public.events;
  v_send_id uuid;
  v_old_response text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_response NOT IN ('yes', 'no') THEN
    RAISE EXCEPTION 'Response must be yes or no';
  END IF;

  SELECT * INTO v_row FROM public.events
  WHERE id = p_event_id AND owner_id = v_caller;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not your event'; END IF;
  -- A NULL from_* means the caller created the row (or the sender is gone)
  -- — there is nobody to reply to.
  IF v_row.from_event_id IS NULL OR v_row.from_user_id IS NULL THEN
    RAISE EXCEPTION 'Nothing to answer — you created this event';
  END IF;

  SELECT s.id, s.response INTO v_send_id, v_old_response
  FROM public.sends s
  JOIN public.my_people mp ON mp.id = s.person_id
  WHERE s.event_id = v_row.from_event_id
    AND mp.owner_id = v_row.from_user_id
    AND mp.user_id = v_caller;
  IF NOT FOUND THEN RAISE EXCEPTION 'No share to answer'; END IF;

  IF v_old_response IS NOT DISTINCT FROM p_response THEN
    RETURN false;
  END IF;

  UPDATE public.sends
  SET response = p_response, responded_at = now()
  WHERE id = v_send_id;
  RETURN true;
END;
$$;

-- get_my_send_response: the recipient's read of their own answer plus the
-- sharer attribution for the Yes/No widget. One row when the event is an
-- answerable share (response NULL = not answered yet); ZERO rows when there
-- is nothing to answer (self-created row, or the send is gone) — the client
-- renders no widget then. Attribution matches the calendar RPC: the
-- recipient's own contact_name for the sender, then the sender's
-- display_name, then NULL.
CREATE FUNCTION public.get_my_send_response(p_event_id uuid)
RETURNS TABLE (response text, sharer_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_row public.events;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM public.events
  WHERE id = p_event_id AND owner_id = v_caller;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not your event'; END IF;
  IF v_row.from_event_id IS NULL OR v_row.from_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.response,
         COALESCE(mp_mine.contact_name, u_from.display_name) AS sharer_name
  FROM public.sends s
  JOIN public.my_people mp
    ON mp.id = s.person_id
   AND mp.owner_id = v_row.from_user_id
   AND mp.user_id = v_caller
  LEFT JOIN public.users u_from ON u_from.id = v_row.from_user_id
  LEFT JOIN public.my_people mp_mine
    ON mp_mine.owner_id = v_caller
   AND mp_mine.user_id = v_row.from_user_id
  WHERE s.event_id = v_row.from_event_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.respond_to_send(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.respond_to_send(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.respond_to_send(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_send_response(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_send_response(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_send_response(uuid) TO authenticated;
