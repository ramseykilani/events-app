-- Break remaining RLS recursion between event_shares and user_events.
-- Use SECURITY DEFINER helper so policy checks do not depend on user_events RLS.

CREATE OR REPLACE FUNCTION public.owns_user_event(p_user_event_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_events ue
    WHERE ue.id = p_user_event_id
      AND ue.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "event_shares_select_owner" ON public.event_shares;
DROP POLICY IF EXISTS "event_shares_insert_owner" ON public.event_shares;
DROP POLICY IF EXISTS "event_shares_delete_owner" ON public.event_shares;

CREATE POLICY "event_shares_select_owner" ON public.event_shares
  FOR SELECT USING (public.owns_user_event(user_event_id));

CREATE POLICY "event_shares_insert_owner" ON public.event_shares
  FOR INSERT WITH CHECK (public.owns_user_event(user_event_id));

CREATE POLICY "event_shares_delete_owner" ON public.event_shares
  FOR DELETE USING (public.owns_user_event(user_event_id));
