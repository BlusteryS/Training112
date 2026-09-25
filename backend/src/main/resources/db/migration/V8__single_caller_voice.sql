CREATE TEMP TABLE migrated_voice_scenario ON COMMIT DROP AS
SELECT id, status
FROM scenario
WHERE document ? 'voice_id';

UPDATE scenario AS s
SET document = jsonb_set(
        s.document - 'voice_id', '{rubric}',
        (SELECT jsonb_agg(
            CASE WHEN criterion->>'kind' = 'deadline' AND criterion->>'action' = 'accepted'
                THEN jsonb_set(criterion, '{action}', '"saved"'::jsonb)
                ELSE criterion END ORDER BY position)
         FROM jsonb_array_elements(s.document->'rubric') WITH ORDINALITY AS rules(criterion, position)),
        false),
    status = CASE WHEN s.status IN ('approved', 'prepared') THEN 'preparing' ELSE s.status END,
    artifact = NULL,
    artifact_sha256 = NULL,
    updated_at = now()
FROM migrated_voice_scenario AS migrated
WHERE s.id = migrated.id;

UPDATE background_job AS job
SET state = 'failed', error = 'Scenario voice changed', finished_at = now(), lease_until = NULL
FROM migrated_voice_scenario AS migrated
WHERE job.scenario_id = migrated.id AND job.state IN ('queued', 'running');

INSERT INTO background_job (id, kind, scenario_id)
SELECT gen_random_uuid(), 'compile_scenario', id
FROM migrated_voice_scenario
WHERE status IN ('approved', 'prepared', 'preparing');
