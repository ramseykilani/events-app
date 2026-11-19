-- Pairing (FEATURES.md -> Pairing): one person starts the couple and gets an
-- invite code; the other enters it. The second arrival closes the couple for
-- good (paired_at), clears the code, and seeds the default channels from
-- channel_presets. There is no third path in: no contacts, no discovery, no
-- re-invite after pairing.

-- Failed code entries, for the brute-force throttle. A failed join returns a
-- status instead of raising, so the attempt row survives the call.
CREATE TABLE public.pair_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pair_attempts_user ON public.pair_attempts(user_id, attempted_at);
ALTER TABLE public.pair_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: only the definer RPC reads or writes it.

-- 8 characters from a 31-symbol alphabet without 0/O/1/I/L: ~8.5e11 codes,
-- readable aloud, and the throttle below makes guessing pointless.
CREATE FUNCTION public.generate_invite_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
BEGIN
  LOOP
    SELECT string_agg(substr(v_alphabet, 1 + floor(random() * 31)::int, 1), '')
      INTO v_code FROM generate_series(1, 8);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.couples WHERE invite_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

-- A setting value is valid when its key is registered with the given scope
-- and the value fits the definition's type (and options, for choices).
CREATE FUNCTION public.setting_value_valid(p_scope text, p_key text, p_value jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.setting_definitions d
    WHERE d.key = p_key AND d.scope = p_scope
      AND (
        (d.value_type = 'boolean' AND jsonb_typeof(p_value) = 'boolean')
        OR (d.value_type = 'choice' AND jsonb_typeof(p_value) = 'string'
            AND (p_value #>> '{}') = ANY (d.options))
      )
  )
$$;

-- Drops any key/value in a settings object that the registry does not accept
-- for the scope. Presets are filtered through it so a typo in a preset can
-- never land an unvalidated key on a channel.
CREATE FUNCTION public.valid_settings(p_scope text, p_settings jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  FROM jsonb_each(COALESCE(p_settings, '{}'::jsonb)) e
  WHERE public.setting_value_valid(p_scope, e.key, e.value)
$$;

-- Creates one channel from a preset for the caller's couple, with prefs rows
-- for both members carrying the preset's personal values. Internal: the
-- public entry points are join_couple (seeding) and create_channel.
CREATE FUNCTION public.create_channel_from_preset(
  p_couple_id uuid,
  p_channel_id uuid,
  p_preset text,
  p_name text,
  p_icon text,
  p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_preset public.channel_presets;
  v_position integer;
BEGIN
  SELECT * INTO v_preset FROM public.channel_presets WHERE key = p_preset;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown preset'; END IF;

  SELECT COALESCE(max(position), 0) + 1 INTO v_position
    FROM public.channels WHERE couple_id = p_couple_id;

  INSERT INTO public.channels (id, couple_id, name, icon, position, settings, created_by)
  VALUES (
    p_channel_id,
    p_couple_id,
    btrim(COALESCE(NULLIF(btrim(p_name), ''), v_preset.name)),
    COALESCE(NULLIF(p_icon, ''), v_preset.icon),
    v_position,
    public.valid_settings('shared', v_preset.shared_settings),
    p_created_by
  );

  INSERT INTO public.channel_prefs (channel_id, user_id, settings)
  SELECT p_channel_id, cm.user_id, public.valid_settings('personal', v_preset.personal_settings)
  FROM public.couple_members cm WHERE cm.couple_id = p_couple_id;

  RETURN p_channel_id;
END;
$$;

-- create_couple: start a couple and get its invite code. Idempotent for the
-- creator of a still-unpaired couple — calling again returns the same couple,
-- with a fresh code if the old one expired. Raises if already paired.
CREATE FUNCTION public.create_couple()
RETURNS TABLE (couple_id uuid, invite_code text, invite_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_couple public.couples;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT c.* INTO v_couple FROM public.couples c
    JOIN public.couple_members cm ON cm.couple_id = c.id
    WHERE cm.user_id = v_caller;

  IF FOUND THEN
    IF v_couple.paired_at IS NOT NULL THEN
      RAISE EXCEPTION 'Already paired';
    END IF;
    IF v_couple.invite_expires_at IS NULL OR v_couple.invite_expires_at <= now() THEN
      UPDATE public.couples
        SET invite_code = public.generate_invite_code(),
            invite_expires_at = now() + interval '7 days'
        WHERE id = v_couple.id
        RETURNING * INTO v_couple;
    END IF;
  ELSE
    INSERT INTO public.couples (created_by, invite_code, invite_expires_at)
      VALUES (v_caller, public.generate_invite_code(), now() + interval '7 days')
      RETURNING * INTO v_couple;
    INSERT INTO public.couple_members (couple_id, slot, user_id)
      VALUES (v_couple.id, 1, v_caller);
  END IF;

  RETURN QUERY SELECT v_couple.id, v_couple.invite_code, v_couple.invite_expires_at;
END;
$$;

-- cancel_invite: the creator of an unpaired couple backs out (e.g. to enter
-- the partner's code instead). A paired couple cannot be cancelled here.
CREATE FUNCTION public.cancel_invite()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.couples c
    USING public.couple_members cm
    WHERE cm.couple_id = c.id AND cm.user_id = v_caller AND c.paired_at IS NULL;
END;
$$;

-- join_couple: enter the partner's code. Returns a status, never raises for
-- an expected miss, so the failed-attempt row commits:
--   'paired'        — joined (or already joined this couple: idempotent)
--   'invalid'       — no such open code
--   'expired'       — the code's 7 days are up (the creator re-opens it)
--   'own_code'      — you entered the code you created
--   'already_paired'— you are in another, paired couple
--   'rate_limited'  — more than 10 misses in the last hour
CREATE FUNCTION public.join_couple(p_code text)
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
  IF v_mine.id IS NOT NULL THEN
    DELETE FROM public.couples WHERE id = v_mine.id;
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

-- get_my_couple: everything the app needs to decide where you are. Zero rows
-- = not in a couple (show pairing). invite_code only while unpaired; the
-- partner's name, never their phone or push token.
CREATE FUNCTION public.get_my_couple()
RETURNS TABLE (
  couple_id uuid,
  paired_at timestamptz,
  invite_code text,
  invite_expires_at timestamptz,
  my_id uuid,
  my_display_name text,
  partner_id uuid,
  partner_display_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,
         c.paired_at,
         CASE WHEN c.paired_at IS NULL THEN c.invite_code END,
         CASE WHEN c.paired_at IS NULL THEN c.invite_expires_at END,
         me.id,
         me.display_name,
         p.id,
         p.display_name
  FROM public.couple_members cm
  JOIN public.couples c ON c.id = cm.couple_id
  JOIN public.users me ON me.id = cm.user_id
  LEFT JOIN public.couple_members pcm ON pcm.couple_id = c.id AND pcm.user_id <> cm.user_id
  LEFT JOIN public.users p ON p.id = pcm.user_id
  WHERE cm.user_id = auth.uid()
$$;

-- set_display_name: the name your partner sees (pairing asks for it first).
CREATE FUNCTION public.set_display_name(p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g'));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Name must be 1 to 40 characters';
  END IF;
  UPDATE public.users SET display_name = v_name WHERE id = auth.uid();
END;
$$;

-- set_push_token: NULL clears it (sign-out). A token moves with the device:
-- a token re-registered by another account is taken off the old one, so a
-- shared phone never gets the previous person's notifications.
CREATE FUNCTION public.set_push_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_token IS NOT NULL THEN
    UPDATE public.users SET expo_push_token = NULL
      WHERE expo_push_token = p_token AND id <> auth.uid();
  END IF;
  UPDATE public.users SET expo_push_token = NULLIF(btrim(p_token), '') WHERE id = auth.uid();
END;
$$;

-- ensure_user_exists: the client-side safety net for the auth trigger (same
-- contract as Events).
CREATE FUNCTION public.ensure_user_exists(p_phone text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  INSERT INTO public.users (id, phone_number)
  VALUES (auth.uid(), COALESCE(btrim(p_phone), ''))
  ON CONFLICT (id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_invite_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_channel_from_preset(uuid, uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.setting_value_valid(text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.valid_settings(text, jsonb) FROM PUBLIC, anon;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.create_couple()',
    'public.cancel_invite()',
    'public.join_couple(text)',
    'public.get_my_couple()',
    'public.set_display_name(text)',
    'public.set_push_token(text)',
    'public.ensure_user_exists(text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
