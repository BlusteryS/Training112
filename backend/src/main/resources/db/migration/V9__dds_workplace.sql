ALTER TABLE lesson ALTER COLUMN scenario_id DROP NOT NULL;
ALTER TABLE lesson ADD COLUMN card_template jsonb;
ALTER TABLE lesson ADD CONSTRAINT lesson_card_template_check CHECK (
    (mode = 'call' AND scenario_id IS NOT NULL AND card_template IS NULL)
    OR (mode = 'card' AND (card_template IS NOT NULL OR scenario_id IS NOT NULL))
);
ALTER TABLE lesson ADD CONSTRAINT lesson_card_template_object_check
    CHECK (card_template IS NULL OR jsonb_typeof(card_template) = 'object');

ALTER TABLE training_attempt ADD COLUMN dds_crew varchar(100);
ALTER TABLE attempt_evaluation ALTER COLUMN scenario_id DROP NOT NULL;
