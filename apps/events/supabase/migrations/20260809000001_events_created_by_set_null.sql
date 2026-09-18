-- Delete Account prep: an event snapshot must survive its creator.
--
-- events.created_by_user_id was NOT NULL ... ON DELETE CASCADE, so deleting
-- an auth.users row would cascade into events and delete every snapshot the
-- user created — which cascades further into other people's user_events
-- copies, stripping events off their calendars and breaking the forwarding
-- model ("removing your copy never affects anyone else's calendar").
--
-- The column is informational only: it grants no mutation rights, and read
-- access for owners flows through user_events (events_select_shared_or_owned
-- / events_select_owner). A NULL creator simply fails the
-- `created_by_user_id = auth.uid()` disjunct, which is correct — a deleted
-- account created nothing. Snapshots with zero remaining owners are reclaimed
-- by cleanup-events, so nothing leaks.

ALTER TABLE public.events ALTER COLUMN created_by_user_id DROP NOT NULL;

ALTER TABLE public.events DROP CONSTRAINT events_created_by_user_id_fkey;
ALTER TABLE public.events
  ADD CONSTRAINT events_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id)
  REFERENCES public.users(id)
  ON DELETE SET NULL;
