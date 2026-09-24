ALTER TABLE training_attempt
    ADD COLUMN workstation varchar(4),
    ADD COLUMN incident_source text,
    ADD COLUMN vis_operator text;

UPDATE training_attempt
SET incident_source = 'Служба 112'
WHERE incident_source IS NULL;

UPDATE scenario
SET document = jsonb_set(document, '{origin}', '"Служба 112"')
WHERE document ->> 'origin' IS NULL;

ALTER TABLE training_attempt
    ADD CONSTRAINT training_attempt_workstation_check
        CHECK (workstation IS NULL OR workstation ~ '^[0-9]{1,4}$'),
    ADD CONSTRAINT training_attempt_incident_source_check
        CHECK (incident_source IN (
            'Служба 112',
            'Служба 101 (КИС УСС (МЧС))',
            'Служба 102 (СОДЧ (МВД))',
            'Служба 103',
            'Служба 104',
            'ЦОДД',
            'Мосводоканал',
            'ЭРА-ГЛОНАСС',
            '112 Московской области',
            '112 Калужской области')),
    ADD CONSTRAINT training_attempt_vis_operator_check
        CHECK (vis_operator IS NULL OR char_length(vis_operator) BETWEEN 1 AND 32),
    ADD CONSTRAINT training_attempt_vis_pair_check
        CHECK ((incident_source = 'Служба 112' AND vis_operator IS NULL)
            OR (incident_source <> 'Служба 112' AND vis_operator IS NOT NULL));

ALTER TABLE training_attempt
    ALTER COLUMN incident_source SET NOT NULL;
