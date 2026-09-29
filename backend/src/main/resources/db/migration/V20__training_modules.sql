CREATE TABLE training_module (
    id uuid PRIMARY KEY,
    instructor_id uuid NOT NULL REFERENCES app_user(id),
    group_id uuid NOT NULL REFERENCES training_group(id),
    title varchar(200) NOT NULL CHECK (length(trim(title)) > 0),
    difficulty varchar(20) NOT NULL CHECK (difficulty IN ('basic', 'intermediate', 'advanced')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (group_id, title)
);

CREATE INDEX training_module_instructor_idx ON training_module(instructor_id, created_at DESC);

ALTER TABLE lesson ADD COLUMN module_id uuid REFERENCES training_module(id);
CREATE INDEX lesson_module_idx ON lesson(module_id);
