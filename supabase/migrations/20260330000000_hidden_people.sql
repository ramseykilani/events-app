-- Hidden people: users can hide contacts so their events don't appear on the calendar
-- and notifications from them are suppressed. Hide is one-way (only affects the
-- person who hid; the hidden contact is unaware and unaffected).
CREATE TABLE hidden_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES my_people(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, person_id)
);

ALTER TABLE hidden_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own hidden_people"
  ON hidden_people FOR ALL USING (owner_id = auth.uid());
