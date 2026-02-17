-- Allow event creator to delete associated user_events (cascade)
CREATE POLICY "user_events_delete_event_creator" ON public.user_events
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = user_events.event_id
      AND e.created_by_user_id = auth.uid()
    )
  );

-- Allow event creator to delete associated event_shares (cascade via user_events)
CREATE POLICY "event_shares_delete_event_creator" ON public.event_shares
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_events ue
      JOIN public.events e ON e.id = ue.event_id
      WHERE ue.id = event_shares.user_event_id
      AND e.created_by_user_id = auth.uid()
    )
  );
