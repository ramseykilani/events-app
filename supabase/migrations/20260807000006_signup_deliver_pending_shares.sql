-- Forwarding semantics: deliver pending shares when a contact joins.
--
-- When someone signs up (or their phone number gets fixed up), existing code
-- resolves my_people.user_id for matching contact rows. Under forwarding
-- semantics that resolution must also deliver the invited user's own copies
-- of every event shared with them while they were off the app — that is the
-- invited-guest flow: SMS -> sign up -> the event is already on your
-- calendar, owned by you.
--
-- Both resolution paths (the on_user_created_resolve_my_people trigger and
-- ensure_user_exists) UPDATE my_people.user_id, so a single AFTER UPDATE
-- trigger covers them both. The BEFORE INSERT resolver
-- (resolve_user_id_on_my_people_insert) fires when a contact row is first
-- created, at which point no shares can reference it yet, so INSERTs need
-- no handling.

CREATE OR REPLACE FUNCTION public.deliver_pending_shares()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    INSERT INTO public.user_events (user_id, event_id)
    SELECT NEW.user_id, ue.event_id
    FROM public.event_shares es
    JOIN public.user_events ue ON ue.id = es.user_event_id
    WHERE es.person_id = NEW.id
    ON CONFLICT (user_id, event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_my_people_user_id_deliver_shares ON public.my_people;
CREATE TRIGGER on_my_people_user_id_deliver_shares
  AFTER UPDATE OF user_id ON public.my_people
  FOR EACH ROW
  EXECUTE FUNCTION public.deliver_pending_shares();
