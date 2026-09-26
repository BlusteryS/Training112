CREATE TABLE card_link (
  child_attempt_id uuid PRIMARY KEY REFERENCES training_attempt(id) ON DELETE CASCADE,
  parent_attempt_id uuid NOT NULL REFERENCES training_attempt(id) ON DELETE CASCADE,
  CHECK (child_attempt_id <> parent_attempt_id)
);

CREATE INDEX card_link_parent_idx ON card_link(parent_attempt_id);
