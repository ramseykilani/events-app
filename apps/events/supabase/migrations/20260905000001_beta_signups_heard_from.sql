-- Beta Signup Heard-From (FEATURES.md): provenance for each beta signup.
-- Nullable so rows that predate the column stay valid; new submits require
-- a non-blank value at the form + validateBetaSubmission layer. The CHECK
-- rejects blank and over-long values when the column is set. The owner SMS
-- reads this via buildOwnerAlertBody.
ALTER TABLE public.beta_signups
  ADD COLUMN heard_from text
  CHECK (
    heard_from IS NULL
    OR (length(trim(heard_from)) > 0 AND char_length(heard_from) <= 200)
  );
