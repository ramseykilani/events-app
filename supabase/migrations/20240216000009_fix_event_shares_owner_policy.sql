-- Fix RLS recursion between user_events and event_shares.
-- Previous event_shares owner SELECT policy referenced user_events, while
-- user_events shared SELECT policy references event_shares, creating a loop.

DROP POLICY IF EXISTS "event_shares_select_owner" ON public.event_shares;

CREATE POLICY "event_shares_select_owner" ON public.event_shares
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.my_people mp
      WHERE mp.id = person_id
        AND mp.owner_id = auth.uid()
    )
  );
