-- Fix: resolve my_people.user_id when a contact is added for an already-registered user.
--
-- Previously, user_id was only resolved by the on_user_created_resolve_my_people
-- trigger (fires on INSERT into public.users). If User A adds User B as a contact
-- AFTER User B has already signed up, user_id stays NULL forever, and User B never
-- sees events shared with them.
--
-- This migration:
--   1. Adds a BEFORE INSERT trigger on my_people to resolve user_id immediately
--   2. Updates ensure_user_exists to fix placeholder phone numbers (so matching works)
--   3. Backfills any existing my_people rows with NULL user_id

-- 1. Trigger function: resolve user_id on my_people insert
CREATE OR REPLACE FUNCTION public.resolve_user_id_on_my_people_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.phone_number IS NOT NULL THEN
    SELECT id INTO NEW.user_id
    FROM public.users
    WHERE phone_number = NEW.phone_number
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_my_people_insert_resolve_user_id ON public.my_people;
CREATE TRIGGER on_my_people_insert_resolve_user_id
  BEFORE INSERT ON public.my_people
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_user_id_on_my_people_insert();

-- 2. Fix ensure_user_exists to update placeholder phone numbers on conflict.
--    Without this, users created by the auth trigger with a missing phone keep a
--    placeholder value and can never be matched by phone_number.
CREATE OR REPLACE FUNCTION public.ensure_user_exists(p_phone text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_phone text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_phone := COALESCE(NULLIF(trim(p_phone), ''), 'placeholder-' || v_uid::text);

  INSERT INTO public.users (id, phone_number, created_at)
  VALUES (v_uid, v_phone, now())
  ON CONFLICT (id) DO UPDATE
    SET phone_number = EXCLUDED.phone_number
    WHERE public.users.phone_number LIKE 'placeholder-%';

  -- When phone was corrected from a placeholder, resolve any my_people rows
  -- that were waiting for this user.
  IF v_phone NOT LIKE 'placeholder-%' THEN
    UPDATE public.my_people
    SET user_id = v_uid
    WHERE phone_number = v_phone
      AND user_id IS NULL;
  END IF;
END;
$$;

-- 3. Backfill existing my_people rows where user_id is NULL but a matching user exists
UPDATE public.my_people mp
SET user_id = u.id
FROM public.users u
WHERE mp.phone_number = u.phone_number
  AND mp.user_id IS NULL;
