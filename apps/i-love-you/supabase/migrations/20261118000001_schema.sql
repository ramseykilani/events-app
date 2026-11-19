-- I Love You schema: two people, one couple, many channels.
--
-- The whole product rests on one invariant: a couple has at most two members,
-- ever. It is structural, not a count check — couple_members is keyed on
-- (couple_id, slot) with slot IN (1, 2), so a third insert is a primary-key
-- violation no matter how two requests race. A person belongs to at most one
-- couple (UNIQUE user_id), and a couple that has paired never takes a new
-- member, even after one of them leaves (couple_members_guard below).
--
-- Channels are generic: a name, an icon, an order, and a bag of settings.
-- No channel behaves differently because of what it is called or how it was
-- made — every difference is a setting either partner can change. The
-- settings registry (setting_definitions) and the presets
-- (channel_presets) are data, so a new toggle or a new starting point is a
-- row, not a code path (FEATURES.md -> Channel Settings).
--
-- Every table has RLS. Clients read through member SELECT policies and write
-- only through SECURITY DEFINER RPCs (later migrations), so the rules
-- (pairing, setting validation, sender-only edits) cannot be bypassed with a
-- direct table write.

-- ===== users =====
-- One row per auth user, created by the auth trigger below (ensure_user_exists
-- is the client-side safety net, same as Events).
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number text NOT NULL DEFAULT '',
  display_name text CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 40),
  expo_push_token text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== couples =====
-- invite_code is single-use: join_couple clears it when the second person
-- arrives. paired_at set = closed for good.
CREATE TABLE public.couples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  invite_code text UNIQUE,
  invite_expires_at timestamptz,
  paired_at timestamptz,
  -- send-push's ring throttle (one "is calling" push per minute).
  last_ring_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT couples_invite_shape CHECK (invite_code IS NULL OR invite_code ~ '^[A-HJ-NP-Z2-9]{8}$')
);

CREATE TABLE public.couple_members (
  couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot IN (1, 2)),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (couple_id, slot)
);

-- Defense in depth behind the RPCs: a paired couple is closed. The row lock
-- serializes concurrent joins on the same couple, so the paired_at read is
-- never stale.
CREATE FUNCTION public.couple_members_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_paired_at timestamptz;
BEGIN
  SELECT paired_at INTO v_paired_at FROM public.couples WHERE id = NEW.couple_id FOR UPDATE;
  IF v_paired_at IS NOT NULL THEN
    RAISE EXCEPTION 'This couple is already paired';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER couple_members_guard
  BEFORE INSERT ON public.couple_members
  FOR EACH ROW EXECUTE FUNCTION public.couple_members_guard();

-- The caller's couple, or NULL. SECURITY DEFINER so RLS policies can call it
-- without recursing through couple_members' own policy.
CREATE FUNCTION public.my_couple_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT couple_id FROM public.couple_members WHERE user_id = auth.uid()
$$;

-- The caller's partner, or NULL (unpaired, or the partner left).
CREATE FUNCTION public.my_partner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cm.user_id FROM public.couple_members cm
  WHERE cm.couple_id = public.my_couple_id() AND cm.user_id <> auth.uid()
$$;

-- ===== the settings registry =====
-- One row per setting. The client mirrors it in lib/channelSettings.ts (label,
-- help text, how it renders) and a Jest test pins the two lists together;
-- every write RPC validates key, type and option against this table, so an
-- unknown key or an out-of-range value can never be stored.
--   scope 'shared'   — one value for both of you (channels.settings)
--   scope 'personal' — each person's own (channel_prefs.settings)
--   value_type 'boolean' — true/false; 'choice' — one of options
CREATE TABLE public.setting_definitions (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]{1,39}$'),
  scope text NOT NULL CHECK (scope IN ('shared', 'personal')),
  value_type text NOT NULL CHECK (value_type IN ('boolean', 'choice')),
  options text[],
  default_value jsonb NOT NULL,
  description text NOT NULL,
  CONSTRAINT setting_definitions_shape CHECK (
    (value_type = 'boolean' AND options IS NULL AND jsonb_typeof(default_value) = 'boolean')
    OR (value_type = 'choice' AND options IS NOT NULL
        AND jsonb_typeof(default_value) = 'string'
        AND (default_value #>> '{}') = ANY (options))
  )
);

INSERT INTO public.setting_definitions (key, scope, value_type, options, default_value, description) VALUES
  -- How this channel reaches you. 'quiet' delivers without sound or banner
  -- (iOS passive interruption, a low-importance Android channel); 'none'
  -- never notifies. The unread dot shows either way.
  ('notify_level', 'personal', 'choice', ARRAY['notify', 'quiet', 'none'], '"notify"',
   'How this channel notifies you: with sound, quietly, or not at all.'),
  ('notify_preview', 'personal', 'boolean', NULL, 'true',
   'Show the message text in the notification, or only the channel name.'),
  ('notify_sound', 'personal', 'choice', ARRAY['default', 'chime', 'none'], '"default"',
   'The sound this channel''s notifications make.'),
  ('read_receipts', 'shared', 'boolean', NULL, 'false',
   'Both of you see when the other has read up to a message.'),
  ('typing_indicator', 'shared', 'boolean', NULL, 'true',
   'Both of you see when the other is typing.'),
  ('items_completable', 'shared', 'boolean', NULL, 'false',
   'Messages can be marked done, and open ones stay findable.'),
  ('allow_urgent', 'shared', 'boolean', NULL, 'false',
   'A message can be flagged "needs you now", which notifies even when this channel is quiet or off.');

-- ===== presets =====
-- Starting points for a channel: a name, an icon, and setting values. Seeding
-- a new couple uses the three default=true presets; creating a channel can
-- start from any of them or from 'blank'. A preset is copied at creation and
-- never consulted again — changing a preset later does not touch existing
-- channels.
CREATE TABLE public.channel_presets (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z_]{1,39}$'),
  name text NOT NULL,
  icon text NOT NULL CHECK (icon ~ '^[a-z0-9-]{1,40}$'),
  shared_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  personal_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  seed_on_pairing boolean NOT NULL DEFAULT false,
  position integer NOT NULL,
  description text NOT NULL
);

INSERT INTO public.channel_presets
  (key, name, icon, shared_settings, personal_settings, seed_on_pairing, position, description) VALUES
  ('everyday', 'Everyday', 'chatbubbles-outline', '{}', '{}', true, 1,
   'The regular chat.'),
  ('heart', 'Heart-to-heart', 'heart-outline',
   '{"typing_indicator": false}', '{"notify_level": "quiet", "notify_preview": false}', true, 2,
   'Deep conversations. Arrives quietly, so you can come to it when you have time.'),
  ('logistics', 'Logistics', 'checkbox-outline',
   '{"items_completable": true, "read_receipts": true, "allow_urgent": true}', '{}', true, 3,
   'Quick questions that need an answer. Mark them done; open ones stay findable.'),
  ('blank', 'New channel', 'ellipse-outline', '{}', '{}', false, 4,
   'Every setting at its default.');

-- ===== channels =====
CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  icon text NOT NULL DEFAULT 'ellipse-outline' CHECK (icon ~ '^[a-z0-9-]{1,40}$'),
  position integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  archived_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  last_message_sender uuid,
  last_message_preview text
);

CREATE INDEX idx_channels_couple ON public.channels(couple_id, position);

-- Per person, per channel: personal settings and read position.
CREATE TABLE public.channel_prefs (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  last_read_at timestamptz,
  PRIMARY KEY (channel_id, user_id)
);

-- ===== messages =====
-- id is client-generated (expo-crypto randomUUID): send_message is
-- INSERT ... ON CONFLICT DO NOTHING on it, so a retried send after a timeout
-- is a no-op instead of a duplicate. couple_id is denormalized for the RLS
-- check and the Realtime filter (couple_id=eq.<id>).
--
-- Deletes are soft (deleted_at, body and attachment cleared) so the partner's
-- client receives the change as an UPDATE and a reply to it can say
-- "Message deleted". Reactions live on the row ({"heart": [user ids]}):
-- two people make the map tiny, and one row change carries every update over
-- Realtime. Moving a message to another channel is an UPDATE of channel_id
-- (author and created_at untouched). updated_at moves on every change — it
-- is the catch-up cursor.
CREATE TABLE public.messages (
  id uuid PRIMARY KEY,
  couple_id uuid NOT NULL REFERENCES public.couples(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'image', 'voice')),
  body text CHECK (body IS NULL OR char_length(body) <= 8000),
  attachment jsonb CHECK (attachment IS NULL OR jsonb_typeof(attachment) = 'object'),
  reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  reactions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(reactions) = 'object'),
  urgent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  edited_at timestamptz,
  deleted_at timestamptz,
  done_at timestamptz,
  done_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  moved_from_channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  moved_at timestamptz,
  -- send-push's idempotency gate: set once, so a retried invoke never
  -- notifies twice.
  notified_at timestamptz
);

CREATE INDEX idx_messages_channel_created ON public.messages(channel_id, created_at DESC, id DESC);
CREATE INDEX idx_messages_couple_updated ON public.messages(couple_id, updated_at);
CREATE INDEX idx_messages_open ON public.messages(channel_id, created_at DESC)
  WHERE done_at IS NULL AND deleted_at IS NULL;

-- ===== auth trigger =====
CREATE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, phone_number)
  VALUES (NEW.id, COALESCE(NEW.phone, ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ===== RLS =====
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couple_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setting_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- users: your own row only. The partner's name reaches you through
-- get_my_couple — their push token and phone never do.
CREATE POLICY users_select_own ON public.users
  FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY couples_select_member ON public.couples
  FOR SELECT TO authenticated USING (id = public.my_couple_id());

CREATE POLICY couple_members_select_member ON public.couple_members
  FOR SELECT TO authenticated USING (couple_id = public.my_couple_id());

-- The registry and presets are product data, the same for everyone.
CREATE POLICY setting_definitions_select ON public.setting_definitions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY channel_presets_select ON public.channel_presets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY channels_select_member ON public.channels
  FOR SELECT TO authenticated USING (couple_id = public.my_couple_id());

-- Your own prefs only: the partner's notification choices are theirs, and
-- their read position reaches you only through get_partner_reads when the
-- channel's read_receipts setting is on.
CREATE POLICY channel_prefs_select_own ON public.channel_prefs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Realtime postgres_changes evaluates this policy per subscriber, so the
-- couple filter on the subscription is a convenience, not the boundary.
CREATE POLICY messages_select_member ON public.messages
  FOR SELECT TO authenticated USING (couple_id = public.my_couple_id());

-- No INSERT/UPDATE/DELETE policies anywhere: writes are RPC-only.

REVOKE EXECUTE ON FUNCTION public.my_couple_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_partner_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_couple_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_partner_id() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.couple_members_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
