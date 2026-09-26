UPDATE lesson
SET card_template = jsonb_set(card_template, '{case_id}', to_jsonb(id::text))
WHERE mode = 'card' AND card_template IS NOT NULL AND NOT card_template ? 'case_id';
