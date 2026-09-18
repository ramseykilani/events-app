-- Archive Received Events hardening (second-opinion review, 2026-09-01):
-- pin server-side the two invariants the UI alone cannot enforce.
--
-- 1. set_event_archived rejects self-created rows (from_user_id IS NULL):
--    self-created events never enter the archive. Account-deletion orphans
--    (from_user_id scrubbed) are likewise rejected — they show Delete
--    instead (accepted corner, owner call 2026-09-01). Restore stays
--    unconditional. The ownership check now happens up front, so the
--    idempotent no-op case falls out of the conditional UPDATEs.
-- 2. events_delete_own covers self-created rows only: there is no delete
--    path for received events, client-crafted or not. Account deletion is
--    unaffected — delete_my_account is SECURITY DEFINER and FK cascades
--    bypass RLS.

CREATE OR REPLACE FUNCTION public.set_event_archived(p_event_id uuid, p_archived boolean)
RETURNS void
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

  IF p_archived AND v_row.from_user_id IS NULL THEN
    RAISE EXCEPTION 'Only received events can be archived';
  END IF;

  -- Idempotent by construction: a write matching the current state changes
  -- nothing (and never touches updated_at).
  IF p_archived THEN
    UPDATE public.events
      SET archived_at = now()
      WHERE id = p_event_id AND archived_at IS NULL;
  ELSE
    UPDATE public.events
      SET archived_at = NULL
      WHERE id = p_event_id AND archived_at IS NOT NULL;
  END IF;
END;
$$;

DROP POLICY events_delete_own ON public.events;
CREATE POLICY events_delete_own ON public.events FOR DELETE
  USING (owner_id = auth.uid() AND from_user_id IS NULL);
