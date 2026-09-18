-- Allow users to delete events they created
CREATE POLICY "events_delete_own" ON public.events
  FOR DELETE
  USING (created_by_user_id = auth.uid());
