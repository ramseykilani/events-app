-- Allow users to update their own row so the app can persist expo_push_token
-- (upserted on authenticated launch) and future self-service fields.
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
