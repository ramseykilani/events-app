-- Messages (FEATURES.md -> Messaging): every write is an RPC, every RPC is
-- idempotent or set-to-value, so the client's optimistic UI can retry after a
-- timeout without duplicating or flipping anything. The client generates
-- message ids; send_message on an id that already exists returns the stored
-- row instead of inserting again.

-- The fixed reaction set. Keys, not emoji: the client renders each as a
-- vector icon tinted by role tokens (design language §9; conventions rule 4).
CREATE FUNCTION public.reaction_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['heart', 'thumbs_up', 'laugh', 'sad', 'flame', 'sparkles']
$$;

-- One line for the channel list and notifications.
CREATE FUNCTION public.message_preview(p_kind text, p_body text, p_deleted boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_deleted THEN NULL
    WHEN p_kind = 'image' AND COALESCE(btrim(p_body), '') = '' THEN 'Photo'
    WHEN p_kind = 'voice' THEN 'Voice note'
    ELSE left(regexp_replace(btrim(COALESCE(p_body, '')), '\s+', ' ', 'g'), 140)
  END
$$;

-- Re-derive a channel's last-message columns from its newest live message
-- (after a delete or a move changed which message that is). Internal.
CREATE FUNCTION public.refresh_channel_last(p_channel_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.channels c SET
    last_message_at = m.created_at,
    last_message_sender = m.sender_id,
    last_message_preview = public.message_preview(m.kind, m.body, false)
  FROM (SELECT NULL::int AS dummy) d
  LEFT JOIN LATERAL (
    SELECT created_at, sender_id, kind, body FROM public.messages
    WHERE channel_id = p_channel_id AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC LIMIT 1
  ) m ON true
  WHERE c.id = p_channel_id
$$;

-- A message in the caller's couple, locked for update, or an exception.
CREATE FUNCTION public.member_message(p_id uuid)
RETURNS public.messages
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_message public.messages;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_message FROM public.messages
    WHERE id = p_id AND couple_id = public.my_couple_id()
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Message not found'; END IF;
  RETURN v_message;
END;
$$;

-- send_message: idempotent on p_id. A same-id retry by the same sender
-- returns the stored row (whatever it says now); a same-id call by anyone
-- else is rejected. p_urgent ("needs you now") is accepted only where the
-- channel's shared allow_urgent setting is on. Sending also marks the
-- channel read up to the new message for the sender.
CREATE FUNCTION public.send_message(
  p_id uuid,
  p_channel_id uuid,
  p_body text,
  p_kind text DEFAULT 'text',
  p_attachment jsonb DEFAULT NULL,
  p_reply_to_id uuid DEFAULT NULL,
  p_urgent boolean DEFAULT false
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_channel public.channels;
  v_existing public.messages;
  v_row public.messages;
  v_body text := NULLIF(btrim(COALESCE(p_body, ''), E' \t\r\n'), '');
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_existing FROM public.messages WHERE id = p_id;
  IF FOUND THEN
    IF v_existing.sender_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Message id already used';
    END IF;
    RETURN v_existing;
  END IF;

  v_channel := public.member_channel(p_channel_id);
  IF v_channel.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Channel is archived';
  END IF;
  IF p_kind NOT IN ('text', 'image', 'voice') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
  IF p_kind = 'text' AND v_body IS NULL THEN RAISE EXCEPTION 'Message is empty'; END IF;
  IF p_kind IN ('image', 'voice') AND (p_attachment IS NULL OR NOT p_attachment ? 'path') THEN
    RAISE EXCEPTION 'Attachment missing';
  END IF;
  -- Attachments must live under the couple's own storage folder.
  IF p_attachment IS NOT NULL
     AND split_part(p_attachment ->> 'path', '/', 1) <> v_channel.couple_id::text THEN
    RAISE EXCEPTION 'Attachment outside this couple';
  END IF;
  IF p_reply_to_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.messages WHERE id = p_reply_to_id AND couple_id = v_channel.couple_id
  ) THEN
    RAISE EXCEPTION 'Reply target not found';
  END IF;
  IF COALESCE(p_urgent, false)
     AND NOT COALESCE((public.channel_setting(p_channel_id, 'allow_urgent'))::text::boolean, false) THEN
    RAISE EXCEPTION 'This channel does not allow "needs you now"';
  END IF;

  INSERT INTO public.messages (id, couple_id, channel_id, sender_id, kind, body, attachment, reply_to_id, urgent)
  VALUES (p_id, v_channel.couple_id, p_channel_id, v_caller, p_kind, v_body, p_attachment, p_reply_to_id,
          COALESCE(p_urgent, false))
  RETURNING * INTO v_row;

  UPDATE public.channels SET
    last_message_at = v_row.created_at,
    last_message_sender = v_caller,
    last_message_preview = public.message_preview(v_row.kind, v_row.body, false)
  WHERE id = p_channel_id;

  INSERT INTO public.channel_prefs (channel_id, user_id, last_read_at)
    VALUES (p_channel_id, v_caller, v_row.created_at)
    ON CONFLICT (channel_id, user_id)
    DO UPDATE SET last_read_at = GREATEST(public.channel_prefs.last_read_at, EXCLUDED.last_read_at);

  RETURN v_row;
END;
$$;

-- edit_message: sender only, text body only, not after delete. A same-body
-- save is a no-op (edited_at untouched).
CREATE FUNCTION public.edit_message(p_id uuid, p_body text)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.messages := public.member_message(p_id);
  v_body text := NULLIF(btrim(COALESCE(p_body, ''), E' \t\r\n'), '');
BEGIN
  IF v_message.sender_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the sender can edit'; END IF;
  IF v_message.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Message was deleted'; END IF;
  IF v_message.kind = 'text' AND v_body IS NULL THEN RAISE EXCEPTION 'Message is empty'; END IF;
  IF v_body IS NOT DISTINCT FROM v_message.body THEN RETURN v_message; END IF;
  UPDATE public.messages
    SET body = v_body, edited_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE id = p_id RETURNING * INTO v_message;
  IF (SELECT last_message_at FROM public.channels WHERE id = v_message.channel_id) = v_message.created_at THEN
    PERFORM public.refresh_channel_last(v_message.channel_id);
  END IF;
  RETURN v_message;
END;
$$;

-- delete_message: sender only, soft, idempotent. Clears body, attachment and
-- reactions; returns the attachment path that was cleared (the client
-- removes the storage object) or NULL.
CREATE FUNCTION public.delete_message(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.messages := public.member_message(p_id);
BEGIN
  IF v_message.sender_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the sender can delete'; END IF;
  IF v_message.deleted_at IS NOT NULL THEN RETURN NULL; END IF;
  UPDATE public.messages
    SET deleted_at = clock_timestamp(), updated_at = clock_timestamp(),
        body = NULL, attachment = NULL, reactions = '{}'::jsonb, urgent = false
    WHERE id = p_id;
  PERFORM public.refresh_channel_last(v_message.channel_id);
  RETURN v_message.attachment ->> 'path';
END;
$$;

-- set_message_done: either partner, only where the channel's shared
-- items_completable setting is on. Set-to-value; returns whether it changed.
CREATE FUNCTION public.set_message_done(p_id uuid, p_done boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.messages := public.member_message(p_id);
BEGIN
  IF NOT COALESCE((public.channel_setting(v_message.channel_id, 'items_completable'))::text::boolean, false) THEN
    RAISE EXCEPTION 'Items cannot be marked done in this channel';
  END IF;
  IF v_message.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Message was deleted'; END IF;
  IF (v_message.done_at IS NOT NULL) = p_done THEN RETURN false; END IF;
  UPDATE public.messages SET
    done_at = CASE WHEN p_done THEN clock_timestamp() END,
    done_by = CASE WHEN p_done THEN auth.uid() END,
    updated_at = clock_timestamp()
  WHERE id = p_id;
  RETURN true;
END;
$$;

-- set_reaction: set-to-value per (message, person, reaction). Returns
-- whether it changed.
CREATE FUNCTION public.set_reaction(p_id uuid, p_reaction text, p_on boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.messages := public.member_message(p_id);
  v_me text := auth.uid()::text;
  v_list jsonb;
  v_has boolean;
BEGIN
  IF NOT (p_reaction = ANY (public.reaction_keys())) THEN RAISE EXCEPTION 'Unknown reaction'; END IF;
  IF v_message.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Message was deleted'; END IF;
  v_list := COALESCE(v_message.reactions -> p_reaction, '[]'::jsonb);
  v_has := v_list ? v_me;
  IF v_has = p_on THEN RETURN false; END IF;
  IF p_on THEN
    v_list := v_list || to_jsonb(v_me);
  ELSE
    v_list := COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(v_list) e WHERE e <> to_jsonb(v_me)), '[]'::jsonb);
  END IF;
  UPDATE public.messages SET
    reactions = CASE WHEN jsonb_array_length(v_list) = 0 THEN reactions - p_reaction
                     ELSE jsonb_set(reactions, ARRAY[p_reaction], v_list) END,
    updated_at = clock_timestamp()
  WHERE id = p_id;
  RETURN true;
END;
$$;

-- move_message: "this belongs in heart-to-heart". Either partner can move
-- any live message to another active channel of the couple. Author,
-- created_at, reactions and replies are untouched; moved_from_channel_id
-- records where it was. Moving to where it already is returns false.
CREATE FUNCTION public.move_message(p_id uuid, p_channel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.messages := public.member_message(p_id);
  v_target public.channels;
BEGIN
  IF v_message.channel_id = p_channel_id THEN RETURN false; END IF;
  IF v_message.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Message was deleted'; END IF;
  v_target := public.member_channel(p_channel_id);
  IF v_target.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Channel is archived'; END IF;
  UPDATE public.messages SET
    channel_id = p_channel_id,
    moved_from_channel_id = v_message.channel_id,
    moved_at = clock_timestamp(),
    -- Completion is a per-channel idea; a moved item starts open only if the
    -- target channel tracks items at all.
    done_at = CASE WHEN COALESCE((public.channel_setting(p_channel_id, 'items_completable'))::text::boolean, false)
                   THEN done_at END,
    done_by = CASE WHEN COALESCE((public.channel_setting(p_channel_id, 'items_completable'))::text::boolean, false)
                   THEN done_by END,
    updated_at = clock_timestamp()
  WHERE id = p_id;
  PERFORM public.refresh_channel_last(v_message.channel_id);
  PERFORM public.refresh_channel_last(p_channel_id);
  RETURN true;
END;
$$;

-- get_messages: one page of a channel's history, newest first, keyset on
-- (created_at, id) so a page boundary never skips or repeats a row.
-- p_before NULL = the newest page.
CREATE FUNCTION public.get_messages(
  p_channel_id uuid,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS SETOF public.messages
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.* FROM public.messages m
  WHERE m.channel_id = p_channel_id
    AND m.couple_id = public.my_couple_id()
    AND (p_before_created_at IS NULL
         OR (m.created_at, m.id) < (p_before_created_at, COALESCE(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
$$;

-- get_message_changes: every message in the couple changed after p_since
-- (inserts, edits, deletes, reactions, done, moves), oldest change first —
-- the catch-up read after the app was offline or Realtime dropped. The
-- client pages by passing the last updated_at it got back.
CREATE FUNCTION public.get_message_changes(p_since timestamptz, p_limit integer DEFAULT 200)
RETURNS SETOF public.messages
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.* FROM public.messages m
  WHERE m.couple_id = public.my_couple_id() AND m.updated_at > p_since
  ORDER BY m.updated_at, m.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500)
$$;

-- get_open_items: the "Open" view of a channel that tracks items — live,
-- not-done messages, newest first.
CREATE FUNCTION public.get_open_items(p_channel_id uuid, p_limit integer DEFAULT 100)
RETURNS SETOF public.messages
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.* FROM public.messages m
  WHERE m.channel_id = p_channel_id
    AND m.couple_id = public.my_couple_id()
    AND m.done_at IS NULL AND m.deleted_at IS NULL
  ORDER BY m.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200)
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_channel_last(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.member_message(uuid) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.send_message(uuid, uuid, text, text, jsonb, uuid, boolean)',
    'public.edit_message(uuid, text)',
    'public.delete_message(uuid)',
    'public.set_message_done(uuid, boolean)',
    'public.set_reaction(uuid, text, boolean)',
    'public.move_message(uuid, uuid)',
    'public.get_messages(uuid, timestamptz, uuid, integer)',
    'public.get_message_changes(timestamptz, integer)',
    'public.get_open_items(uuid, integer)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
