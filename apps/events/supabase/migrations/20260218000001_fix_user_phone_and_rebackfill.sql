-- Fix user phone numbers and re-backfill my_people.user_id.
--
-- The previous backfill (20260218000000) matched on exact phone_number equality.
-- If users.phone_number was empty, a placeholder, or formatted differently than
-- my_people.phone_number, no rows were resolved. This migration:
--
--   1. Corrects users.phone_number from the authoritative source (auth.users.phone)
--   2. Re-runs the backfill with flexible phone matching (strips leading '+')
--   3. Updates triggers to use flexible matching going forward

-- 1. Fix users.phone_number from auth.users.phone (the authoritative source).
--    Handles empty strings, placeholders, or any mismatch.
UPDATE public.users u
SET phone_number = au.phone
FROM auth.users au
WHERE au.id = u.id
  AND au.phone IS NOT NULL
  AND au.phone <> ''
  AND u.phone_number IS DISTINCT FROM au.phone;

-- 2. Re-backfill my_people.user_id with flexible phone matching.
--    Strips leading '+' from both sides to handle format differences.
UPDATE public.my_people mp
SET user_id = u.id
FROM public.users u
WHERE mp.user_id IS NULL
  AND mp.phone_number IS NOT NULL
  AND u.phone_number IS NOT NULL
  AND u.phone_number <> ''
  AND u.phone_number NOT LIKE 'placeholder-%'
  AND regexp_replace(mp.phone_number, '^\+', '') = regexp_replace(u.phone_number, '^\+', '');

-- 3. Update the BEFORE INSERT trigger to use flexible phone matching.
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
    WHERE regexp_replace(phone_number, '^\+', '') = regexp_replace(NEW.phone_number, '^\+', '')
      AND phone_number NOT LIKE 'placeholder-%'
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Update the existing on-user-created trigger to also use flexible matching.
CREATE OR REPLACE FUNCTION public.resolve_my_people_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.my_people
  SET user_id = NEW.id
  WHERE user_id IS NULL
    AND regexp_replace(phone_number, '^\+', '') = regexp_replace(NEW.phone_number, '^\+', '');
  RETURN NEW;
END;
$$;

-- 5. Update ensure_user_exists to also fix empty-string phones (not just placeholders),
--    and to resolve my_people after correcting the phone.
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
    WHERE public.users.phone_number LIKE 'placeholder-%'
       OR public.users.phone_number = '';

  -- Resolve my_people.user_id for contacts that reference this phone
  IF v_phone NOT LIKE 'placeholder-%' THEN
    UPDATE public.my_people
    SET user_id = v_uid
    WHERE user_id IS NULL
      AND regexp_replace(phone_number, '^\+', '') = regexp_replace(v_phone, '^\+', '');
  END IF;
END;
$$;
