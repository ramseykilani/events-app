-- Notification On/Off: per-account recipient preferences for share
-- notifications. notify_push gates the Expo push, notify_sms gates the
-- Twilio SMS; send-notification reads them at send time. Both default true
-- so existing accounts keep today's behavior (push + SMS). Events land on
-- the recipient's calendar regardless — the share_event copy path does not
-- consult these. Non-app recipients have no users row and are unaffected
-- (Twilio STOP remains their opt-out).
--
-- No new RLS: users_update_own (20260807000002) already lets users write
-- their own row, which is how the People footer toggles persist.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notify_push boolean NOT NULL DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notify_sms boolean NOT NULL DEFAULT true;
