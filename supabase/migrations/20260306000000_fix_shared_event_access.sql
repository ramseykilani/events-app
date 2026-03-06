-- Fix: Recipients cannot view shared event details.
--
-- Root cause: The events RLS policy checks access via a subquery chain
-- (user_events -> event_shares -> my_people).  Each table in the chain
-- applies its own RLS.  my_people only has an ALL policy requiring
-- owner_id = auth.uid(), so the recipient — who is the *contact*, not
-- the owner — cannot see the my_people row that links them to the share.
-- The subquery returns nothing, the events row is invisible, and the
-- event detail screen shows "Access removed."
--
-- The calendar is unaffected because get_calendar_events is SECURITY
-- DEFINER, which bypasses RLS.
--
-- Fix: Add a SELECT-only policy on my_people so users can read rows
-- where they are the referenced contact (user_id = auth.uid()).  This
-- allows the events / user_events / event_shares RLS subqueries to
-- resolve correctly for share recipients.

CREATE POLICY "my_people_select_as_contact"
  ON public.my_people
  FOR SELECT
  USING (user_id = auth.uid());
