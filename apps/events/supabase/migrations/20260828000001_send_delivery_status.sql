-- Share Delivery Status (FEATURES.md): persist per-recipient SMS delivery on
-- the share record. sends is the share record (✓ Shared, "Shared with",
-- notifications, pending delivery) — these columns extend it with what
-- happened to the notification text. Written only by the send-notification
-- edge function (at send time) and the twilio-status webhook (carrier
-- states), both service-role; reads ride the existing sends_select_owner
-- policy, so no new RLS.

ALTER TABLE public.sends
  ADD COLUMN sms_sid text,
  ADD COLUMN sms_status text,
  ADD COLUMN sms_error_code text,
  ADD COLUMN sms_status_at timestamptz;

-- NULL sms_status = no SMS was attempted (app-user recipient with texts off,
-- Twilio not configured, reserved test number) or a pre-feature row — the
-- client renders those as the legacy "✓ Shared".
ALTER TABLE public.sends
  ADD CONSTRAINT sends_sms_status_check
  CHECK (sms_status IN ('queued', 'sent', 'delivered', 'undelivered', 'failed'));

-- The twilio-status webhook finds the row by the Twilio message SID it
-- stored at send time.
CREATE UNIQUE INDEX idx_sends_sms_sid
  ON public.sends(sms_sid) WHERE sms_sid IS NOT NULL;
