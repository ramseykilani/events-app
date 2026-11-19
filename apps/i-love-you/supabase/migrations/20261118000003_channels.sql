-- Channels (FEATURES.md -> Channels, Channel Settings): either partner can
-- create, rename, re-icon, reorder, archive and restore channels, and change
-- any setting at any time. Archive is reversible (design language §3: Archive
-- never wears red); there is no channel delete — a channel's history is
-- shared, so neither person can destroy it alone.

-- Effective settings: registry defaults overlaid with the stored values.
-- Stored keys the registry no longer knows are dropped on the way out, so
-- retiring a setting is a registry delete, not a data migration.
CREATE FUNCTION public.effective_settings(p_scope text, p_stored jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(
           d.key,
           CASE WHEN p_stored ? d.key AND public.setting_value_valid(p_scope, d.key, p_stored -> d.key)
                THEN p_stored -> d.key ELSE d.default_value END
         ), '{}'::jsonb)
  FROM public.setting_definitions d
  WHERE d.scope = p_scope
$$;

-- One shared setting's effective value for a channel (internal helper for
-- the message RPCs: done-marking, urgent flags, receipts).
CREATE FUNCTION public.channel_setting(p_channel_id uuid, p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.effective_settings('shared', c.settings) -> p_key
  FROM public.channels c WHERE c.id = p_channel_id
$$;

-- The caller's channel, locked for update, or an exception. Internal.
CREATE FUNCTION public.member_channel(p_channel_id uuid)
RETURNS public.channels
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_channel public.channels;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_channel FROM public.channels
    WHERE id = p_channel_id AND couple_id = public.my_couple_id()
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Channel not found'; END IF;
  RETURN v_channel;
END;
$$;

-- get_channels: the home surface. Active channels in order, then archived
-- ones (archived_at set, the client groups them). unread is a boolean on
-- purpose — the design language bans counts; the client shows a quiet dot.
CREATE FUNCTION public.get_channels()
RETURNS TABLE (
  id uuid,
  name text,
  icon text,
  "position" integer,
  archived_at timestamptz,
  settings jsonb,
  my_settings jsonb,
  last_message_at timestamptz,
  last_message_sender uuid,
  last_message_preview text,
  last_read_at timestamptz,
  unread boolean,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.icon, c.position, c.archived_at,
         public.effective_settings('shared', c.settings),
         public.effective_settings('personal', COALESCE(p.settings, '{}'::jsonb)),
         c.last_message_at, c.last_message_sender, c.last_message_preview,
         p.last_read_at,
         (c.last_message_at IS NOT NULL
          AND c.last_message_sender IS DISTINCT FROM auth.uid()
          AND (p.last_read_at IS NULL OR c.last_message_at > p.last_read_at)),
         c.updated_at
  FROM public.channels c
  LEFT JOIN public.channel_prefs p ON p.channel_id = c.id AND p.user_id = auth.uid()
  WHERE c.couple_id = public.my_couple_id()
  ORDER BY (c.archived_at IS NOT NULL), c.position, c.created_at
$$;

-- create_channel: idempotent on the client-generated id (a retried create
-- after a timeout returns the same channel). Starts from a preset — 'blank'
-- for every default.
CREATE FUNCTION public.create_channel(p_id uuid, p_name text, p_icon text, p_preset text DEFAULT 'blank')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_couple uuid := public.my_couple_id();
  v_existing public.channels;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_couple IS NULL OR (SELECT paired_at FROM public.couples WHERE id = v_couple) IS NULL THEN
    RAISE EXCEPTION 'Not paired';
  END IF;
  IF char_length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Name must be 1 to 40 characters';
  END IF;

  SELECT * INTO v_existing FROM public.channels WHERE id = p_id;
  IF FOUND THEN
    IF v_existing.couple_id <> v_couple THEN RAISE EXCEPTION 'Channel not found'; END IF;
    RETURN v_existing.id;
  END IF;

  RETURN public.create_channel_from_preset(v_couple, p_id, COALESCE(p_preset, 'blank'), p_name, p_icon, auth.uid());
END;
$$;

-- update_channel: name and/or icon (NULL leaves a field alone). Returns
-- whether anything changed — a same-value save is a no-op.
CREATE FUNCTION public.update_channel(p_id uuid, p_name text DEFAULT NULL, p_icon text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel public.channels := public.member_channel(p_id);
  v_name text := COALESCE(btrim(p_name), v_channel.name);
  v_icon text := COALESCE(p_icon, v_channel.icon);
BEGIN
  IF char_length(v_name) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Name must be 1 to 40 characters';
  END IF;
  IF v_icon !~ '^[a-z0-9-]{1,40}$' THEN RAISE EXCEPTION 'Invalid icon'; END IF;
  IF v_name = v_channel.name AND v_icon = v_channel.icon THEN RETURN false; END IF;
  UPDATE public.channels SET name = v_name, icon = v_icon, updated_at = now() WHERE id = p_id;
  RETURN true;
END;
$$;

-- reorder_channels: positions follow the given order. Every id must be one of
-- the couple's channels; ids not listed keep their relative order after the
-- listed ones.
CREATE FUNCTION public.reorder_channels(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_couple uuid := public.my_couple_id();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_ids) AS i(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = i.id AND c.couple_id = v_couple)
  ) THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  WITH ordered AS (
    SELECT c.id,
           row_number() OVER (
             ORDER BY COALESCE(array_position(p_ids, c.id), 2147483647), c.position, c.created_at
           ) AS pos
    FROM public.channels c WHERE c.couple_id = v_couple
  )
  UPDATE public.channels c SET position = o.pos, updated_at = now()
  FROM ordered o WHERE o.id = c.id AND c.position IS DISTINCT FROM o.pos;
END;
$$;

-- set_channel_archived: reversible, idempotent set-to-value. Returns whether
-- the state changed. An archived channel is read-only until restored.
CREATE FUNCTION public.set_channel_archived(p_id uuid, p_archived boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel public.channels := public.member_channel(p_id);
BEGIN
  IF (v_channel.archived_at IS NOT NULL) = p_archived THEN RETURN false; END IF;
  UPDATE public.channels
    SET archived_at = CASE WHEN p_archived THEN now() END, updated_at = now()
    WHERE id = p_id;
  RETURN true;
END;
$$;

-- set_channel_setting: the one write path for every setting, shared or
-- personal — the registry decides which (and validates the value). Returns
-- whether the stored value changed; a same-value write is a no-op.
CREATE FUNCTION public.set_channel_setting(p_channel_id uuid, p_key text, p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel public.channels := public.member_channel(p_channel_id);
  v_def public.setting_definitions;
  v_current jsonb;
BEGIN
  SELECT * INTO v_def FROM public.setting_definitions WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown setting'; END IF;
  IF NOT public.setting_value_valid(v_def.scope, p_key, p_value) THEN
    RAISE EXCEPTION 'Invalid value for %', p_key;
  END IF;

  IF v_def.scope = 'shared' THEN
    v_current := public.effective_settings('shared', v_channel.settings) -> p_key;
    IF v_current = p_value THEN RETURN false; END IF;
    UPDATE public.channels
      SET settings = settings || jsonb_build_object(p_key, p_value), updated_at = now()
      WHERE id = p_channel_id;
  ELSE
    SELECT public.effective_settings('personal', COALESCE(
             (SELECT settings FROM public.channel_prefs
              WHERE channel_id = p_channel_id AND user_id = auth.uid()), '{}'::jsonb)) -> p_key
      INTO v_current;
    IF v_current = p_value THEN RETURN false; END IF;
    INSERT INTO public.channel_prefs (channel_id, user_id, settings)
      VALUES (p_channel_id, auth.uid(), jsonb_build_object(p_key, p_value))
      ON CONFLICT (channel_id, user_id)
      DO UPDATE SET settings = public.channel_prefs.settings || EXCLUDED.settings;
  END IF;
  RETURN true;
END;
$$;

-- mark_channel_read: the read position only ever moves forward, and never
-- past now() (a skewed client clock cannot mark the future read).
CREATE FUNCTION public.mark_channel_read(p_channel_id uuid, p_read_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_at timestamptz := LEAST(COALESCE(p_read_at, now()), now());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.channels WHERE id = p_channel_id AND couple_id = public.my_couple_id()) THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;
  INSERT INTO public.channel_prefs (channel_id, user_id, last_read_at)
    VALUES (p_channel_id, auth.uid(), v_at)
    ON CONFLICT (channel_id, user_id)
    DO UPDATE SET last_read_at = GREATEST(public.channel_prefs.last_read_at, EXCLUDED.last_read_at);
END;
$$;

-- get_partner_reads: the partner's read position per channel — only for
-- channels whose shared read_receipts setting is on. Off means the row is
-- simply absent; the client cannot tell "unread" from "receipts off", which
-- is the point.
CREATE FUNCTION public.get_partner_reads()
RETURNS TABLE (channel_id uuid, last_read_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, p.last_read_at
  FROM public.channels c
  JOIN public.channel_prefs p ON p.channel_id = c.id AND p.user_id = public.my_partner_id()
  WHERE c.couple_id = public.my_couple_id()
    AND (public.effective_settings('shared', c.settings) ->> 'read_receipts')::boolean
    AND p.last_read_at IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.effective_settings(text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.channel_setting(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.member_channel(uuid) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.get_channels()',
    'public.create_channel(uuid, text, text, text)',
    'public.update_channel(uuid, text, text)',
    'public.reorder_channels(uuid[])',
    'public.set_channel_archived(uuid, boolean)',
    'public.set_channel_setting(uuid, text, jsonb)',
    'public.mark_channel_read(uuid, timestamptz)',
    'public.get_partner_reads()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
