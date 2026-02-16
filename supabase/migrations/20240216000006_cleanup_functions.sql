-- Cleanup functions for cron jobs

-- Cleanup old event shares and orphaned data
CREATE OR REPLACE FUNCTION public.cleanup_old_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff date := (CURRENT_DATE - INTERVAL '6 months');
BEGIN
  -- Delete event_shares where event_date is older than 6 months
  DELETE FROM public.event_shares es
  USING public.user_events ue
  JOIN public.events e ON e.id = ue.event_id
  WHERE es.user_event_id = ue.id
    AND e.event_date < cutoff;

  -- Delete user_events with no event_shares
  DELETE FROM public.user_events
  WHERE id NOT IN (SELECT user_event_id FROM public.event_shares);

  -- Delete events with no user_events
  DELETE FROM public.events
  WHERE id NOT IN (SELECT event_id FROM public.user_events);
END;
$$;
