ALTER TABLE training_attempt ADD COLUMN card_template jsonb;

UPDATE training_attempt a SET card_template = l.card_template
FROM lesson_assignment la JOIN lesson l ON l.id = la.lesson_id
WHERE a.assignment_id = la.id AND l.mode = 'card' AND l.card_template->'facts' IS NOT NULL;

ALTER TABLE training_attempt ADD CONSTRAINT training_attempt_card_template_object
  CHECK (card_template IS NULL OR jsonb_typeof(card_template) = 'object');
