-- Fix: Restore correct events SELECT policy.
-- Events should only be readable by the creator, the event owner (via user_events),
-- or someone the event was shared with (via event_shares).
-- The previous "events_select_all" policy (USING true) was a security hole.

DROP POLICY IF EXISTS "events_select_all" ON public.events;
DROP POLICY IF EXISTS "events_select_shared_or_owned" ON public.events;

CREATE POLICY "events_select_shared_or_owned" ON public.events
  FOR SELECT USING (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_events ue
      WHERE ue.event_id = events.id AND ue.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_events ue
      JOIN public.event_shares es ON es.user_event_id = ue.id
      JOIN public.my_people mp ON mp.id = es.person_id
      WHERE ue.event_id = events.id AND mp.user_id = auth.uid()
    )
  );
