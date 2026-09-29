-- Convert old card lessons that used a call scenario into ordinary DDS card lessons.
UPDATE lesson l
SET card_template = jsonb_build_object(
    'case_id', gen_random_uuid()::text,
    'title', 'Карточка ДДС: ' || s.title,
    'origin', 'Служба 112',
    'facts', jsonb_build_object(
        'phone', coalesce(s.document#>>'{facts,phone}', ''),
        'address', coalesce(s.document#>>'{facts,address}', ''),
        'description', coalesce(s.document#>>'{facts,incident}', ''),
        'incident_code', s.title,
        'caller_name', coalesce(s.document#>>'{facts,caller_name}', ''),
        'victims', coalesce(s.document#>>'{facts,victims}', ''),
        'district', coalesce(s.document#>>'{facts,district}', ''),
        'okrug', coalesce(s.document#>>'{facts,okrug}', ''),
        'incident_types', '[]',
        'survey_answers', '{}'),
    'services', jsonb_build_array(g.service_code),
    'expected_primary', 'accepted',
    'outcome', 'completed')
FROM scenario s, training_group g
WHERE l.mode = 'card' AND l.card_template IS NULL
    AND l.scenario_id = s.id AND l.group_id = g.id;

UPDATE lesson SET scenario_id = NULL WHERE mode = 'card';

ALTER TABLE lesson DROP CONSTRAINT lesson_card_template_check;
ALTER TABLE lesson ADD CONSTRAINT lesson_card_template_check CHECK (
    (mode = 'call' AND scenario_id IS NOT NULL AND card_template IS NULL)
    OR (mode = 'card' AND scenario_id IS NULL AND card_template IS NOT NULL)
);

-- Every card template now carries the same optional fields. Blank values mean
-- that the caller did not provide the information.
CREATE FUNCTION normalize_dds_facts(facts jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_build_object(
        'caller_name', '', 'phone', '', 'address', '', 'address_description', '',
        'description', '', 'victims', '', 'incident_code', '', 'district', '',
        'okrug', '', 'object', '', 'scene_phone', '', 'provided_phone', '',
        'communication_channel', '', 'caller_status', '', 'street', '',
        'house', '', 'entrance', '', 'floor', '', 'landmark', '',
        'incident_sign_2', '', 'incident_sign_3', '', 'incident_details', '',
        'classifier_code', '', 'incident_types', '[]', 'survey_answers', '{}',
        'birth_date', '', 'residence', '', 'medical_help', '',
        'blocked_people', '', 'building', '', 'structure', '',
        'apartment', '', 'entry_code', '', 'city', '', 'country', '',
        'foreign_language', '', 'foreign_phone', '', 'law_violation', '')
        || coalesce(facts, '{}'::jsonb)
$$;

UPDATE lesson
SET card_template = jsonb_set(card_template, '{facts}',
    normalize_dds_facts(card_template->'facts'))
WHERE mode = 'card' AND card_template ? 'facts';

UPDATE lesson l
SET card_template = jsonb_set(l.card_template, '{cards}', (
    SELECT jsonb_agg(jsonb_set(item, '{facts}',
        normalize_dds_facts(item->'facts')) ORDER BY position)
    FROM jsonb_array_elements(l.card_template->'cards') WITH ORDINALITY AS cards(item, position)))
WHERE l.mode = 'card' AND l.card_template ? 'cards';

UPDATE training_attempt a
SET card_template = l.card_template
FROM lesson_assignment la JOIN lesson l ON l.id = la.lesson_id
WHERE a.assignment_id = la.id AND l.mode = 'card' AND a.card_template IS NULL
    AND l.card_template ? 'facts';

UPDATE training_attempt a
SET card_template = jsonb_set(a.card_template, '{facts}',
    normalize_dds_facts(a.card_template->'facts'))
FROM lesson_assignment la JOIN lesson l ON l.id = la.lesson_id
WHERE a.assignment_id = la.id AND l.mode = 'card';

UPDATE training_attempt a
SET card = normalize_dds_facts(a.card_template->'facts')
    || jsonb_build_object(
        'dds_service', g.service_code,
        'origin', a.card_template->>'origin',
        'services', array_to_string(ARRAY(
            SELECT jsonb_array_elements_text(a.card_template->'services')), ', '))
    || a.card
FROM lesson_assignment la
JOIN lesson l ON l.id = la.lesson_id
JOIN training_group g ON g.id = l.group_id
WHERE a.assignment_id = la.id AND l.mode = 'card';

DROP FUNCTION normalize_dds_facts(jsonb);
