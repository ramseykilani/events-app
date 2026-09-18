-- Forwarding semantics: cleanup must never reap personal copies.
--
-- The old cleanup_old_events deleted event_shares older than 6 months and
-- then any user_events with no remaining shares. That made sense when shares
-- carried visibility; under forwarding semantics every user_events row is a
-- person's independent copy, so step 2 would delete events straight off
-- people's calendars. Only truly orphaned snapshots (no remaining owners)
-- are reclaimed now. The EXECUTE revocations from
-- 20260807000004_revoke_cleanup_execute.sql persist across CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.cleanup_old_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.events
  WHERE id NOT IN (SELECT event_id FROM public.user_events);
END;
$$;
