-- Beta Signup Pipeline (FEATURES.md): one row per beta-signup form
-- submission, driving the automated tester-fulfillment pipeline — iOS via
-- the App Store Connect API (the beta-ios-fulfill cron poller), Android via
-- the Grok Bot's Play Console email-list add (beta-signup's shared-secret
-- pending/fulfill routes).
--
-- Access: service-role only. RLS is enabled with ZERO policies — anon and
-- authenticated get default-deny on everything; the edge functions use the
-- service role, which bypasses RLS. Unlike the affiliate registry this
-- table is PII (name, emails, phone), so there is deliberately no
-- world-readable SELECT policy.
CREATE TABLE public.beta_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- ASC user invitations require both a first and a last name.
  first_name text NOT NULL CHECK (length(trim(first_name)) > 0),
  last_name text NOT NULL CHECK (length(trim(last_name)) > 0),
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'both')),
  -- Apple ID email feeds iOS fulfillment; Play Store Gmail is what the Bot
  -- pastes into the internal-track list; the E.164 phone carries the
  -- Android completion SMS. NULL when the platform doesn't use it —
  -- iOS-only signups leave phone empty (nothing consumes it).
  apple_email text,
  play_email text,
  phone text,
  -- Per-platform state machines; NULL = that platform wasn't requested.
  -- ios: pending → invited (ASC userInvitation sent) → accepted (the user
  -- row appeared) → added (in the Team (Expo) beta group — Apple's own
  -- TestFlight email finishes the flow). android: pending → added (the
  -- Bot's webhook; the completion SMS goes out on that flip). 'failed' is
  -- terminal (e.g. ASC rejects the email, or the Bot reports Play rejected
  -- the Gmail); transient errors hold the status and land in the error
  -- column for next-cycle retry.
  ios_status text CHECK (ios_status IN ('pending', 'invited', 'accepted', 'added', 'failed')),
  android_status text CHECK (android_status IN ('pending', 'added', 'failed')),
  ios_error text,
  android_error text,
  -- Platform/field coherence: the form collects exactly what each
  -- platform's fulfillment consumes — no more, no less.
  CHECK ((platform IN ('ios', 'both')) = (apple_email IS NOT NULL)),
  CHECK ((platform IN ('android', 'both')) = (play_email IS NOT NULL)),
  CHECK ((platform IN ('android', 'both')) = (phone IS NOT NULL)),
  CHECK ((platform IN ('ios', 'both')) = (ios_status IS NOT NULL)),
  CHECK ((platform IN ('android', 'both')) = (android_status IS NOT NULL))
);

ALTER TABLE public.beta_signups ENABLE ROW LEVEL SECURITY;

-- One row per identity: dedup is enforced here, not just in the function's
-- read-then-insert (which would race two parallel submits). NULLs are
-- exempt from unique indexes, so iOS-only rows (no phone) never collide.
-- A 23505 from the insert means "already signed up" — the function maps it
-- to the same idempotent response as its pre-check.
CREATE UNIQUE INDEX beta_signups_apple_email_key ON public.beta_signups (apple_email);
CREATE UNIQUE INDEX beta_signups_play_email_key ON public.beta_signups (play_email);
CREATE UNIQUE INDEX beta_signups_phone_key ON public.beta_signups (phone);
