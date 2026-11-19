-- Push claims (FEATURES.md -> Notifications): the send-push edge function's
-- whole decision lives here, in SQL the semantics suite can pin, so the
-- function itself is transport only.
--
-- Notifications are person-triggered only: the sender's client invokes
-- send-push after its write lands. Each claim is the idempotency gate — a
-- message notifies at most once however often the invoke is retried, and a
-- ring at most once a minute. Both are service_role only: the edge function
-- authenticates the caller from their JWT and passes the id in.

-- claim_message_push: one row when the partner should be notified about this
-- message, zero rows otherwise (already notified, not the sender, no partner
-- token, or the partner's notify_level is 'none' and the message is not
-- urgent). The row carries everything the payload needs: the partner's
-- effective personal settings for the channel (level, preview, sound) and the
-- channel's identity (id, name) — the notification's title is the channel.
CREATE FUNCTION public.claim_message_push(p_message_id uuid, p_caller uuid)
RETURNS TABLE (
  message_id uuid,
  message_kind text,
  message_body text,
  urgent boolean,
  channel_id uuid,
  channel_name text,
  sender_name text,
  partner_token text,
  partner_settings jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.messages;
  v_partner uuid;
  v_token text;
  v_settings jsonb;
BEGIN
  UPDATE public.messages m SET notified_at = clock_timestamp()
    WHERE m.id = p_message_id AND m.sender_id = p_caller AND m.notified_at IS NULL AND m.deleted_at IS NULL
    RETURNING m.* INTO v_message;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT cm.user_id INTO v_partner FROM public.couple_members cm
    WHERE cm.couple_id = v_message.couple_id AND cm.user_id <> p_caller;
  IF v_partner IS NULL THEN RETURN; END IF;

  SELECT u.expo_push_token INTO v_token FROM public.users u WHERE u.id = v_partner;
  IF v_token IS NULL THEN RETURN; END IF;

  v_settings := public.effective_settings('personal', COALESCE(
    (SELECT cp.settings FROM public.channel_prefs cp WHERE cp.channel_id = v_message.channel_id AND cp.user_id = v_partner),
    '{}'::jsonb));

  -- "Needs you now" overrides the partner's quiet or off level — it exists
  -- only where both of them left the shared allow_urgent setting on.
  IF v_settings ->> 'notify_level' = 'none' AND NOT v_message.urgent THEN RETURN; END IF;

  RETURN QUERY
  SELECT v_message.id, v_message.kind, v_message.body, v_message.urgent,
         c.id, c.name, COALESCE(u.display_name, 'Your partner'), v_token, v_settings
  FROM public.channels c
  LEFT JOIN public.users u ON u.id = p_caller
  WHERE c.id = v_message.channel_id;
END;
$$;

-- claim_ring_push: one row (the partner's token and the caller's name) when
-- a "come to the room" push should go out; zero rows when the partner has no
-- token or the couple rang in the last minute.
CREATE FUNCTION public.claim_ring_push(p_caller uuid)
RETURNS TABLE (partner_token text, caller_name text, couple_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_couple uuid;
  v_token text;
BEGIN
  SELECT cm.couple_id INTO v_couple FROM public.couple_members cm WHERE cm.user_id = p_caller;
  IF v_couple IS NULL THEN RETURN; END IF;

  UPDATE public.couples c SET last_ring_at = now()
    WHERE c.id = v_couple AND c.paired_at IS NOT NULL
      AND (c.last_ring_at IS NULL OR c.last_ring_at < now() - interval '1 minute');
  IF NOT FOUND THEN RETURN; END IF;

  SELECT u.expo_push_token INTO v_token
    FROM public.couple_members cm JOIN public.users u ON u.id = cm.user_id
    WHERE cm.couple_id = v_couple AND cm.user_id <> p_caller;
  IF v_token IS NULL THEN RETURN; END IF;

  RETURN QUERY SELECT v_token, COALESCE((SELECT u.display_name FROM public.users u WHERE u.id = p_caller), 'Your partner'), v_couple;
END;
$$;

-- clear_push_token: Expo reported the token dead (DeviceNotRegistered).
CREATE FUNCTION public.clear_push_token(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users SET expo_push_token = NULL WHERE expo_push_token = p_token
$$;

-- room_for_member: the LiveKit room name for a caller, or NULL when they are
-- not in a paired couple. One room per couple: the drop-in room and a ringing
-- call are the same room.
CREATE FUNCTION public.room_for_member(p_caller uuid)
RETURNS TABLE (room text, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'couple-' || c.id::text, COALESCE(u.display_name, 'Partner')
  FROM public.couple_members cm
  JOIN public.couples c ON c.id = cm.couple_id AND c.paired_at IS NOT NULL
  JOIN public.users u ON u.id = cm.user_id
  WHERE cm.user_id = p_caller
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.claim_message_push(uuid, uuid)',
    'public.claim_ring_push(uuid)',
    'public.clear_push_token(text)',
    'public.room_for_member(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
