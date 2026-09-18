-- cleanup_old_events is SECURITY DEFINER and destructive. New Postgres
-- functions are executable by PUBLIC by default, so any authenticated client
-- could call it directly via supabase.rpc() and bypass the cleanup-events
-- edge function's cron-secret check. Revoke execute from client roles; the
-- service role (used by the edge function) keeps its grant.
REVOKE EXECUTE ON FUNCTION public.cleanup_old_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_events() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_events() FROM authenticated;
