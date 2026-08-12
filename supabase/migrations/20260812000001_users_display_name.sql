-- Display names: a self-chosen name used to attribute shares ("Ramsey added
-- you to ...") instead of the raw phone number. Nullable: existing accounts
-- stay NULL until their first share, where the client gates the Share action
-- on a saved name (users who never share are never asked).
--
-- The CHECK constraint is the real validation boundary: users_update_own RLS
-- lets any authenticated user write their own row via raw REST, and the value
-- is interpolated unescaped at the start of an SMS body — so empty (after
-- trim), over-long, and newline-containing names must be rejected server-side.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.users ADD CONSTRAINT users_display_name_valid
  CHECK (
    display_name IS NULL
    OR (char_length(btrim(display_name)) BETWEEN 1 AND 50 AND display_name !~ '[\r\n]')
  );
