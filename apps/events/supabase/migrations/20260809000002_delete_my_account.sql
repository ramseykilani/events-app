-- Delete Account: self-serve account deletion (Apple App Review 5.1.1(v),
-- Play data-deletion requirement).
--
-- Deleting the auth.users row is the whole operation — everything the user
-- owns hangs off it with ON DELETE CASCADE:
--   public.users (id → auth.users CASCADE)
--     → my_people (owner_id CASCADE)   → circle_members, event_shares (person_id CASCADE)
--     → circles (owner_id CASCADE)     → circle_members
--     → hidden_people (owner_id CASCADE)
--     → user_events (user_id CASCADE)  → event_shares (user_event_id CASCADE)
-- Other users' my_people rows pointing at the deleted account get user_id
-- SET NULL — the contact reverts to a pending phone-number entry, so future
-- shares get the non-app SMS and a re-signup triggers pending-share delivery
-- (deliver_pending_shares guards on NEW.user_id IS NOT NULL, so the SET NULL
-- cascade itself is a no-op). Events the user created keep living on
-- recipients' calendars with created_by_user_id SET NULL (see
-- 20260809000001_events_created_by_set_null.sql).
--
-- Client-side deletion of auth users isn't possible with the anon key, so
-- this SECURITY DEFINER function is the deletion path. It deletes exactly the
-- caller's own row; execute is revoked from PUBLIC/anon and granted to
-- authenticated only (same lockdown as 20260807000004).

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM auth.users WHERE id = v_caller;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_my_account() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
