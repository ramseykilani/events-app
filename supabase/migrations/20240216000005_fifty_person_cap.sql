-- 50-person cap on my_people per owner
CREATE OR REPLACE FUNCTION public.check_my_people_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  person_count int;
BEGIN
  SELECT COUNT(*) INTO person_count
  FROM public.my_people
  WHERE owner_id = NEW.owner_id;

  IF person_count >= 50 THEN
    RAISE EXCEPTION 'Cannot add more than 50 people. Maximum limit reached.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_my_people_cap ON public.my_people;
CREATE TRIGGER enforce_my_people_cap
  BEFORE INSERT ON public.my_people
  FOR EACH ROW
  EXECUTE FUNCTION public.check_my_people_cap();
