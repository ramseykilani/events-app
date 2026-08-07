-- Events are immutable snapshots: removing an event from the app must never
-- destroy a snapshot other users have adopted. The client now removes only the
-- caller's own user_events row (their shares cascade), so the creator-level
-- DELETE policies introduced in 20260217000000/20260217000001 are removed.
-- Orphaned events rows are reclaimed by the cleanup-events function.

DROP POLICY IF EXISTS "events_delete_own" ON public.events;
DROP POLICY IF EXISTS "user_events_delete_event_creator" ON public.user_events;
DROP POLICY IF EXISTS "event_shares_delete_event_creator" ON public.event_shares;
