-- Supply the metadata that earlier DDS templates did not store.
UPDATE lesson
SET card_template = card_template || jsonb_build_object(
    'case_id', coalesce(card_template->>'case_id', gen_random_uuid()::text),
    'expected_primary', coalesce(card_template->>'expected_primary', 'accepted'),
    'outcome', coalesce(card_template->>'outcome', 'completed'),
    'origin', coalesce(card_template->>'origin', 'Служба 112'))
WHERE mode = 'card' AND card_template ? 'facts';

UPDATE lesson l
SET card_template = jsonb_set(l.card_template, '{cards}', (
    SELECT jsonb_agg(item || jsonb_build_object(
        'case_id', coalesce(item->>'case_id', gen_random_uuid()::text),
        'expected_primary', coalesce(item->>'expected_primary', 'accepted'),
        'outcome', coalesce(item->>'outcome', 'completed'),
        'origin', coalesce(item->>'origin', 'Служба 112')) ORDER BY position)
    FROM jsonb_array_elements(l.card_template->'cards') WITH ORDINALITY AS cards(item, position)))
WHERE l.mode = 'card' AND l.card_template ? 'cards';

UPDATE training_attempt a
SET card_template = a.card_template || jsonb_build_object(
    'case_id', coalesce(a.card_template->>'case_id',
        l.card_template->>'case_id', gen_random_uuid()::text),
    'expected_primary', coalesce(a.card_template->>'expected_primary', 'accepted'),
    'outcome', coalesce(a.card_template->>'outcome', 'completed'),
    'origin', coalesce(a.card_template->>'origin', 'Служба 112'))
FROM lesson_assignment la JOIN lesson l ON l.id = la.lesson_id
WHERE a.assignment_id = la.id AND l.mode = 'card';

ALTER TABLE training_attempt ADD CONSTRAINT training_attempt_dds_template_fields CHECK (
    card_template IS NULL OR card_template ?& ARRAY[
        'facts', 'case_id', 'expected_primary', 'outcome', 'origin', 'services']);
