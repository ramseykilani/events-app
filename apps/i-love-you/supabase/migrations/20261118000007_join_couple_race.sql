-- join_couple race fix. A creator who entered someone else's code while
-- their own invite was being redeemed deleted their own couple
-- unconditionally — including when the partner had just joined it, who was
-- told 'paired' and then found no couple at all (their seeded channels gone
-- with it). The abandoned couple is now deleted only while still unpaired;
-- if it paired meanwhile, the caller is 'already_paired' in it.

CREATE OR REPLACE FUNCTION public.join_couple(p_code text)
RETURNS TABLE (status text, couple_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_code text := upper(regexp_replace(COALESCE(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_couple public.couples;
  v_mine public.couples;
  v_preset record;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT c.* INTO v_mine FROM public.couples c
    JOIN public.couple_members cm ON cm.couple_id = c.id
    WHERE cm.user_id = v_caller;

  IF FOUND AND v_mine.paired_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_paired'::text, v_mine.id;
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.pair_attempts
      WHERE user_id = v_caller AND attempted_at > now() - interval '1 hour') >= 10 THEN
    RETURN QUERY SELECT 'rate_limited'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Lock the target so two people racing the same code serialize here; the
  -- (couple_id, slot) primary key is the backstop either way.
  SELECT * INTO v_couple FROM public.couples WHERE invite_code = v_code FOR UPDATE;

  IF NOT FOUND OR v_couple.paired_at IS NOT NULL THEN
    INSERT INTO public.pair_attempts (user_id) VALUES (v_caller);
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_mine.id IS NOT NULL AND v_mine.id = v_couple.id THEN
    RETURN QUERY SELECT 'own_code'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_couple.invite_expires_at <= now() THEN
    INSERT INTO public.pair_attempts (user_id) VALUES (v_caller);
    RETURN QUERY SELECT 'expired'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Joining someone else's couple abandons the one you started.
  -- Only while it is still unpaired: v_mine was read without a lock, and
  -- someone may have joined it since. The DELETE re-checks paired_at after
  -- waiting on that joiner's row lock, so a couple that just paired is never
  -- deleted out from under its new member.
  IF v_mine.id IS NOT NULL THEN
    DELETE FROM public.couples WHERE id = v_mine.id AND paired_at IS NULL;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'already_paired'::text, v_mine.id;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.couple_members (couple_id, slot, user_id)
    VALUES (v_couple.id, 2, v_caller);
  UPDATE public.couples
    SET paired_at = now(), invite_code = NULL, invite_expires_at = NULL
    WHERE id = v_couple.id;

  FOR v_preset IN
    SELECT key FROM public.channel_presets WHERE seed_on_pairing ORDER BY position
  LOOP
    PERFORM public.create_channel_from_preset(
      v_couple.id, gen_random_uuid(), v_preset.key, NULL, NULL, NULL
    );
  END LOOP;

  RETURN QUERY SELECT 'paired'::text, v_couple.id;
END;
$$;
