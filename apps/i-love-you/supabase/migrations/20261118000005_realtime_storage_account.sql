-- Realtime, attachments storage, and account deletion.
--
-- Realtime is the deliberate exception to the family's pull-not-push rule
-- (docs/i-love-you-design.md -> Live, not pulled): a conversation that only
-- refreshes on focus is not a conversation. The boundary is unchanged —
-- postgres_changes is filtered by each subscriber's RLS, and the private
-- broadcast topic (typing, read positions, call presence) is authorized by
-- the realtime.messages policy below.
--
-- The realtime and storage schemas exist on hosted Supabase and on the CLI's
-- local stack; the scratch Postgres used by supabase/tests/run_local.sh has
-- neither, so those blocks are guarded and the SQL suite covers the public
-- schema only.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE
      public.messages, public.channels, public.channel_prefs, public.couple_members, public.couples;
  END IF;
END $$;

-- The one broadcast topic per couple: 'couple:<couple id>'. Members may
-- receive and send on their own couple's topic only.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE $p$
      CREATE POLICY couple_topic_receive ON realtime.messages
        FOR SELECT TO authenticated
        USING (realtime.topic() = 'couple:' || public.my_couple_id()::text
               AND realtime.messages.extension IN ('broadcast', 'presence'))
    $p$;
    EXECUTE $p$
      CREATE POLICY couple_topic_send ON realtime.messages
        FOR INSERT TO authenticated
        WITH CHECK (realtime.topic() = 'couple:' || public.my_couple_id()::text
                    AND realtime.messages.extension IN ('broadcast', 'presence'))
    $p$;
  END IF;
END $$;

-- Attachments: private bucket, one folder per couple
-- (<couple id>/<message id>/<file>). Both members read and upload in their
-- folder; only the uploader deletes (delete_message hands the path back).
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('attachments', 'attachments', false, 26214400,
            ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
                  'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/mpeg'])
    ON CONFLICT (id) DO NOTHING;

    EXECUTE $p$
      CREATE POLICY attachments_select_member ON storage.objects
        FOR SELECT TO authenticated
        USING (bucket_id = 'attachments'
               AND (storage.foldername(name))[1] = public.my_couple_id()::text)
    $p$;
    EXECUTE $p$
      CREATE POLICY attachments_insert_member ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'attachments'
                    AND (storage.foldername(name))[1] = public.my_couple_id()::text)
    $p$;
    EXECUTE $p$
      CREATE POLICY attachments_delete_uploader ON storage.objects
        FOR DELETE TO authenticated
        USING (bucket_id = 'attachments'
               AND (storage.foldername(name))[1] = public.my_couple_id()::text
               AND owner_id = auth.uid()::text)
    $p$;
  END IF;
END $$;

-- delete_my_account: a couple's history belongs to both people, and a couple
-- with one member left is not a couple. Deleting your account therefore ends
-- the couple: every channel and message goes with it (both sides), and your
-- partner lands back on pairing. The client says exactly this in the confirm
-- dialog. Attachment files are removed by the client first
-- (lib/account.ts) — SQL cannot reach the object store.
CREATE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.couples WHERE id = public.my_couple_id();
  DELETE FROM auth.users WHERE id = v_caller;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
