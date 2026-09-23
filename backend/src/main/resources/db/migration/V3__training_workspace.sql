ALTER TABLE scenario ADD COLUMN archived boolean NOT NULL DEFAULT false;
CREATE INDEX attempt_assignment_created ON training_attempt(assignment_id, created_at DESC);
CREATE INDEX group_member_user ON training_group_member(user_id);
CREATE INDEX scenario_author_created ON scenario(author_id, created_at DESC);
