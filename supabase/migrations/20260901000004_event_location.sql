-- Location (FEATURES.md, spec owner-approved 2026-09-01): one free-text
-- `location` column on events ("Sarah's place", "Signal, 175 Morgan Ave").
-- No Places API, no autocomplete — the field is text everywhere. Threaded
-- through the whole Copy + Follow pipeline exactly like image_url: save_event
-- (param, no-op compare, owner UPDATE, cascade UPDATE), share_event and
-- deliver_pending_shares (INSERT column lists), and both read RPCs
-- (RETURNS TABLE + SELECT).

ALTER TABLE public.events ADD COLUMN location text;

-- save_event: gains p_location after p_image_url (listing-field order).
-- DROP (not OR REPLACE) because the parameter list changes — leaving the
-- old signature would make every 7-arg call ambiguous.
DROP FUNCTION public.save_event(uuid, text, text, text, text, date, time);

CREATE FUNCTION public.save_event(
  p_id uuid,
  p_url text,
  p_title text,
  p_description text,
  p_image_url text,
  p_location text,
  p_event_date date,
  p_event_time time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_existing public.events;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_existing FROM public.events WHERE id = p_id;

  IF NOT FOUND THEN
    -- Create path. A retry of an aborted create finds the row and falls
    -- through to the no-op check below instead of double-creating.
    INSERT INTO public.events
      (id, owner_id, url, title, description, image_url, location, event_date, event_time)
    VALUES
      (p_id, v_caller, p_url, p_title, p_description, p_image_url, p_location, p_event_date, p_event_time);
    RETURN p_id;
  END IF;

  IF v_existing.owner_id <> v_caller THEN
    RAISE EXCEPTION 'Not your event';
  END IF;

  -- No-op rule: a save that changes nothing does NOT end following and
  -- does not cascade. (Also what makes create-retries side-effect-free.)
  IF v_existing.url         IS NOT DISTINCT FROM p_url
     AND v_existing.title       IS NOT DISTINCT FROM p_title
     AND v_existing.description IS NOT DISTINCT FROM p_description
     AND v_existing.image_url   IS NOT DISTINCT FROM p_image_url
     AND v_existing.location    IS NOT DISTINCT FROM p_location
     AND v_existing.event_date  IS NOT DISTINCT FROM p_event_date
     AND v_existing.event_time  IS NOT DISTINCT FROM p_event_time THEN
    RETURN p_id;
  END IF;

  -- Edit path: any change ends following (owner decision 2)...
  UPDATE public.events
  SET url = p_url, title = p_title, description = p_description,
      image_url = p_image_url, location = p_location,
      event_date = p_event_date, event_time = p_event_time,
      frozen = true, updated_at = now()
  WHERE id = p_id;

  -- ...then propagate to every row still following this one, walking the
  -- follow tree. UNION (not UNION ALL) dedupes visited ids, so a row is
  -- never updated twice and a cycle terminates by construction. The walk
  -- only descends through non-frozen rows, so a frozen intermediary prunes
  -- its whole subtree from this cascade.
  WITH RECURSIVE descendants AS (
    SELECT id FROM public.events
    WHERE from_event_id = p_id AND NOT frozen
    UNION
    SELECT e.id FROM public.events e
    JOIN descendants d ON e.from_event_id = d.id
    WHERE NOT e.frozen
  )
  UPDATE public.events e
  SET url = p_url, title = p_title, description = p_description,
      image_url = p_image_url, location = p_location,
      event_date = p_event_date, event_time = p_event_time,
      updated_at = now()
  FROM descendants d
  -- AND NOT e.frozen is load-bearing, not redundant with the CTE: the CTE is
  -- evaluated once at the statement snapshot, but this outer predicate is
  -- what EvalPlanQual re-evaluates on the new row version after a lock wait
  -- (see Concurrency in the spec).
  WHERE e.id = d.id AND NOT e.frozen;

  RETURN p_id;
END;
$$;

-- share_event: recipient copies carry the sender's current location.
CREATE OR REPLACE FUNCTION public.share_event(p_event_id uuid, p_person_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_row public.events;
  v_inserted integer;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM public.events
  WHERE id = p_event_id AND owner_id = v_caller;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not your event'; END IF;

  -- Record the sends (own contacts only; idempotent).
  INSERT INTO public.sends (event_id, person_id)
  SELECT p_event_id, pid
  FROM unnest(p_person_ids) AS pid
  WHERE EXISTS (
    SELECT 1 FROM public.my_people mp
    WHERE mp.id = pid AND mp.owner_id = v_caller
  )
  ON CONFLICT (event_id, person_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Deliver each app-user recipient their own copy of MY row as it is now.
  -- Contacts without an account get theirs at sign-up (deliver_pending_shares).
  INSERT INTO public.events
    (owner_id, url, title, description, image_url, location, event_date, event_time,
     from_event_id, from_user_id)
  SELECT mp.user_id, v_row.url, v_row.title, v_row.description, v_row.image_url,
         v_row.location, v_row.event_date, v_row.event_time, p_event_id, v_caller
  FROM public.my_people mp
  WHERE mp.owner_id = v_caller
    AND mp.id = ANY (p_person_ids)
    AND mp.user_id IS NOT NULL
    AND mp.user_id <> v_caller
  ON CONFLICT (owner_id, from_event_id) WHERE from_event_id IS NOT NULL DO NOTHING;

  UPDATE public.my_people SET last_shared_at = now()
  WHERE owner_id = v_caller AND id = ANY (p_person_ids);

  RETURN v_inserted;
END;
$$;

-- deliver_pending_shares: pending copies are stamped from the sender's row
-- as it is at sign-up — location included.
CREATE OR REPLACE FUNCTION public.deliver_pending_shares()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    INSERT INTO public.events
      (owner_id, url, title, description, image_url, location, event_date, event_time,
       from_event_id, from_user_id)
    SELECT NEW.user_id, s.url, s.title, s.description, s.image_url, s.location,
           s.event_date, s.event_time, s.id, s.owner_id
    FROM public.sends sd
    JOIN public.events s ON s.id = sd.event_id
    WHERE sd.person_id = NEW.id
      AND s.owner_id <> NEW.user_id
    ON CONFLICT (owner_id, from_event_id) WHERE from_event_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- get_calendar_events / get_archived_events: return type gains location.
-- DROP (not OR REPLACE) because the return types change.
DROP FUNCTION public.get_calendar_events(uuid, date, date);
DROP FUNCTION public.get_archived_events(date);

CREATE FUNCTION public.get_calendar_events(
  p_user_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  image_url text,
  location text,
  url text,
  event_date date,
  event_time time,
  sharer_contact_name text,
  sharer_person_id uuid,
  sharer_user_id uuid,
  from_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Cannot read another user''s calendar';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.title, e.description, e.image_url, e.location, e.url, e.event_date, e.event_time,
    COALESCE(mp.contact_name, u_from.display_name) AS sharer_contact_name,
    mp.id AS sharer_person_id,
    COALESCE(e.from_user_id, p_user_id) AS sharer_user_id,
    e.from_user_id
  FROM public.events e
  LEFT JOIN public.my_people mp
    ON mp.owner_id = p_user_id AND mp.user_id = e.from_user_id
  LEFT JOIN public.users u_from
    ON u_from.id = e.from_user_id
  LEFT JOIN public.hidden_people hp
    ON hp.owner_id = p_user_id AND hp.person_id = mp.id
  WHERE e.owner_id = p_user_id
    AND e.event_date >= p_start_date
    AND e.event_date <= p_end_date
    AND e.archived_at IS NULL
    AND hp.id IS NULL
  ORDER BY e.event_date, e.event_time NULLS LAST;
END;
$$;

CREATE FUNCTION public.get_archived_events(p_today date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  image_url text,
  location text,
  url text,
  event_date date,
  event_time time,
  sharer_contact_name text,
  sharer_person_id uuid,
  sharer_user_id uuid,
  from_user_id uuid,
  archived_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.title, e.description, e.image_url, e.location, e.url, e.event_date, e.event_time,
    COALESCE(mp.contact_name, u_from.display_name) AS sharer_contact_name,
    mp.id AS sharer_person_id,
    COALESCE(e.from_user_id, v_caller) AS sharer_user_id,
    e.from_user_id,
    e.archived_at
  FROM public.events e
  LEFT JOIN public.my_people mp
    ON mp.owner_id = v_caller AND mp.user_id = e.from_user_id
  LEFT JOIN public.users u_from
    ON u_from.id = e.from_user_id
  WHERE e.owner_id = v_caller
    AND e.archived_at IS NOT NULL
  ORDER BY
    (e.event_date >= p_today) DESC,
    CASE WHEN e.event_date >= p_today THEN e.event_date END ASC,
    CASE WHEN e.event_date < p_today THEN e.event_date END DESC,
    e.event_time NULLS LAST,
    e.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_event(uuid, text, text, text, text, text, date, time) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_event(uuid, text, text, text, text, text, date, time) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_event(uuid, text, text, text, text, text, date, time) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.share_event(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.share_event(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.share_event(uuid, uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_calendar_events(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_calendar_events(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_calendar_events(uuid, date, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_archived_events(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_archived_events(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_archived_events(date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.deliver_pending_shares() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deliver_pending_shares() FROM anon;
GRANT EXECUTE ON FUNCTION public.deliver_pending_shares() TO authenticated;
