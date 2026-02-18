-- Rollback: undo the shared_with_user_id migration.
--
-- Restores the original behavior: removing someone from My People cascade-deletes
-- their event_shares rows, fully revoking event access.

-- 1. Drop the policy first (it references shared_with_user_id)
DROP POLICY IF EXISTS "events_select_shared_or_owned" ON public.events;

-- 2. Delete orphaned event_shares where person_id was SET NULL
--    (these would have been cascade-deleted under the original FK)
DELETE FROM public.event_shares WHERE person_id IS NULL;

-- 3. Drop the shared_with_user_id column (also drops the index)
ALTER TABLE public.event_shares
  DROP COLUMN IF EXISTS shared_with_user_id;

-- 4. Restore person_id NOT NULL constraint
ALTER TABLE public.event_shares
  ALTER COLUMN person_id SET NOT NULL;

-- 5. Restore FK with ON DELETE CASCADE
ALTER TABLE public.event_shares
  DROP CONSTRAINT IF EXISTS event_shares_person_id_fkey;

ALTER TABLE public.event_shares
  ADD CONSTRAINT event_shares_person_id_fkey
  FOREIGN KEY (person_id) REFERENCES public.my_people(id) ON DELETE CASCADE;

-- 6. Restore original events SELECT policy
CREATE POLICY "events_select_shared_or_owned" ON public.events
  FOR SELECT USING (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_events ue
      WHERE ue.event_id = events.id AND ue.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_events ue
      JOIN public.event_shares es ON es.user_event_id = ue.id
      JOIN public.my_people mp ON mp.id = es.person_id
      WHERE ue.event_id = events.id AND mp.user_id = auth.uid()
    )
  );

-- 6. Restore original get_calendar_events function
CREATE OR REPLACE FUNCTION public.get_calendar_events(
  p_user_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  title text,
  description text,
  image_url text,
  url text,
  event_date date,
  event_time time,
  sharer_contact_name text,
  sharer_user_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Events shared WITH the user
  SELECT
    es.id,
    e.id AS event_id,
    e.title,
    e.description,
    e.image_url,
    e.url,
    e.event_date,
    e.event_time,
    mp_owner.contact_name AS sharer_contact_name,
    ue.user_id AS sharer_user_id
  FROM public.my_people mp_me
  JOIN public.event_shares es ON es.person_id = mp_me.id
  JOIN public.user_events ue ON ue.id = es.user_event_id
  JOIN public.events e ON e.id = ue.event_id
  LEFT JOIN public.my_people mp_owner ON mp_owner.owner_id = p_user_id AND mp_owner.user_id = ue.user_id
  WHERE mp_me.user_id = p_user_id
    AND e.event_date >= p_start_date
    AND e.event_date <= p_end_date

  UNION ALL

  -- Events owned BY the user
  SELECT
    ue.id,
    e.id AS event_id,
    e.title,
    e.description,
    e.image_url,
    e.url,
    e.event_date,
    e.event_time,
    NULL AS sharer_contact_name,
    ue.user_id AS sharer_user_id
  FROM public.user_events ue
  JOIN public.events e ON e.id = ue.event_id
  WHERE ue.user_id = p_user_id
    AND e.event_date >= p_start_date
    AND e.event_date <= p_end_date
    AND NOT EXISTS (
      SELECT 1 FROM public.event_shares es
      JOIN public.my_people mp ON mp.id = es.person_id
      WHERE es.user_event_id = ue.id AND mp.user_id = p_user_id
    )

  ORDER BY event_date, event_time NULLS LAST;
$$;
