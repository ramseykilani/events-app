-- Trigger: Create users row when auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, phone_number, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.phone::text, (NEW.raw_user_meta_data->>'phone'), ''),
    now()
  );
  RETURN NEW;
END;
$$;

-- Note: Creating triggers on auth.users may require superuser or specific Supabase permissions.
-- If this fails, the app will create the users row on first sign-in (see SessionContext).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Note: Supabase Auth may store phone in different places. If the trigger fails, consider:
-- 1. Using Supabase Auth webhooks to call an Edge Function that inserts into users
-- 2. Or having the app insert the user row after signup with the phone from the session

-- Trigger: On users insert, match phone_number to my_people and populate user_id
CREATE OR REPLACE FUNCTION public.resolve_my_people_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.my_people
  SET user_id = NEW.id
  WHERE phone_number = NEW.phone_number
    AND user_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_created_resolve_my_people ON public.users;
CREATE TRIGGER on_user_created_resolve_my_people
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_my_people_user_id();
