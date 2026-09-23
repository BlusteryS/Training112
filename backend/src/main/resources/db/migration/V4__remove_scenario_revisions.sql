ALTER TABLE scenario
    ADD COLUMN document jsonb,
    ADD COLUMN status varchar(16),
    ADD COLUMN artifact text,
    ADD COLUMN artifact_sha256 varchar(64),
    ADD COLUMN approved_by uuid REFERENCES app_user(id),
    ADD COLUMN approved_at timestamptz,
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE scenario s
SET document = latest.document,
    status = latest.status,
    artifact = latest.artifact,
    artifact_sha256 = latest.artifact_sha256,
    approved_by = latest.approved_by,
    approved_at = latest.approved_at,
    updated_at = latest.created_at
FROM (
    SELECT DISTINCT ON (scenario_id)
        scenario_id, document, status, artifact, artifact_sha256,
        approved_by, approved_at, created_at
    FROM scenario_revision
    ORDER BY scenario_id, version DESC
) latest
WHERE latest.scenario_id = s.id;

ALTER TABLE scenario
    ALTER COLUMN document SET NOT NULL,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'preparing',
    ADD CONSTRAINT scenario_document_check CHECK (jsonb_typeof(document) = 'object'),
    ADD CONSTRAINT scenario_status_check
        CHECK (status IN ('draft','preparing','prepared','approved','failed')),
    ADD CONSTRAINT scenario_artifact_sha256_check
        CHECK (artifact_sha256 IS NULL OR artifact_sha256 ~ '^[a-f0-9]{64}$'),
    ADD CONSTRAINT scenario_artifact_check
        CHECK (status NOT IN ('prepared','approved') OR
            (artifact IS NOT NULL AND artifact_sha256 IS NOT NULL)),
    ADD CONSTRAINT scenario_approval_check
        CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL));

ALTER TABLE lesson ADD COLUMN scenario_id uuid;
UPDATE lesson l SET scenario_id = r.scenario_id
FROM scenario_revision r WHERE r.id = l.revision_id;
ALTER TABLE lesson
    ALTER COLUMN scenario_id SET NOT NULL,
    ADD CONSTRAINT lesson_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES scenario(id),
    DROP COLUMN revision_id;

ALTER TABLE attempt_evaluation ADD COLUMN scenario_id uuid;
UPDATE attempt_evaluation e SET scenario_id = r.scenario_id
FROM scenario_revision r WHERE r.id = e.rubric_revision_id;
ALTER TABLE attempt_evaluation
    ALTER COLUMN scenario_id SET NOT NULL,
    ADD CONSTRAINT attempt_evaluation_scenario_id_fkey
        FOREIGN KEY (scenario_id) REFERENCES scenario(id),
    DROP COLUMN rubric_revision_id;

ALTER TABLE background_job ADD COLUMN scenario_id uuid;
UPDATE background_job j SET scenario_id = r.scenario_id
FROM scenario_revision r WHERE r.id = j.revision_id;
ALTER TABLE background_job DROP CONSTRAINT background_job_check;
DROP INDEX one_revision_compiler;
ALTER TABLE background_job
    ADD CONSTRAINT background_job_scenario_id_fkey
        FOREIGN KEY (scenario_id) REFERENCES scenario(id),
    ADD CONSTRAINT background_job_subject_check
        CHECK ((kind = 'compile_scenario' AND scenario_id IS NOT NULL AND attempt_id IS NULL)
            OR (kind = 'evaluate_attempt' AND attempt_id IS NOT NULL AND scenario_id IS NULL)),
    DROP COLUMN revision_id;
CREATE UNIQUE INDEX one_scenario_compiler ON background_job(scenario_id)
    WHERE state IN ('queued','running');

ALTER TABLE training_attempt DROP COLUMN revision_id;

DROP TRIGGER scenario_revision_immutable ON scenario_revision;
DROP FUNCTION guard_scenario_revision();
DROP TABLE scenario_revision;
