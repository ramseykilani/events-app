-- RPC to create users row on first sign-in (bypasses RLS)
-- Called by the app when session is established; trigger may not run in all setups
CREATE OR REPLACE FUNCTION public.ensure_user_exists(p_phone text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.users (id, phone_number, created_at)
  VALUES (
    v_uid,
    COALESCE(NULLIF(trim(p_phone), ''), 'placeholder-' || v_uid::text),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

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
