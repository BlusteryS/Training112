ALTER TABLE app_user DROP CONSTRAINT app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check CHECK (role IN ('user', 'teacher', 'admin'));
ALTER TABLE app_user ADD COLUMN blocked boolean NOT NULL DEFAULT false;

CREATE TABLE training_group (
    id uuid PRIMARY KEY,
    teacher_id uuid NOT NULL REFERENCES app_user(id),
    name varchar(200) NOT NULL,
    service_code varchar(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE training_group_member (
    group_id uuid NOT NULL REFERENCES training_group(id),
    user_id uuid NOT NULL REFERENCES app_user(id),
    PRIMARY KEY (group_id, user_id)
);
CREATE TABLE scenario (
    id uuid PRIMARY KEY,
    author_id uuid NOT NULL REFERENCES app_user(id),
    title varchar(200) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE scenario_revision (
    id uuid PRIMARY KEY,
    scenario_id uuid NOT NULL REFERENCES scenario(id),
    version integer NOT NULL CHECK (version > 0),
    document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
    status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','preparing','prepared','approved','failed')),
    artifact text,
    artifact_sha256 varchar(64),
    approved_by uuid REFERENCES app_user(id),
    approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (scenario_id, version),
    CHECK (artifact_sha256 IS NULL OR artifact_sha256 ~ '^[a-f0-9]{64}$'),
    CHECK (status NOT IN ('prepared','approved') OR (artifact IS NOT NULL AND artifact_sha256 IS NOT NULL)),
    CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE FUNCTION guard_scenario_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.document IS DISTINCT FROM OLD.document OR NEW.scenario_id <> OLD.scenario_id
       OR NEW.version <> OLD.version OR NEW.id <> OLD.id OR OLD.status = 'approved' THEN
        RAISE EXCEPTION 'Scenario revisions are immutable; create another revision';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
        (OLD.status IN ('draft','failed') AND NEW.status = 'preparing') OR
        (OLD.status = 'preparing' AND NEW.status IN ('prepared','failed')) OR
        (OLD.status = 'prepared' AND NEW.status = 'approved')
    ) THEN RAISE EXCEPTION 'Invalid scenario lifecycle transition'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER scenario_revision_immutable BEFORE UPDATE ON scenario_revision
    FOR EACH ROW EXECUTE FUNCTION guard_scenario_revision();

CREATE TABLE lesson (
    id uuid PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES training_group(id),
    revision_id uuid NOT NULL REFERENCES scenario_revision(id),
    mode varchar(16) NOT NULL CHECK (mode IN ('call','card')),
    status varchar(16) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);
CREATE TABLE lesson_assignment (
    id uuid PRIMARY KEY,
    lesson_id uuid NOT NULL REFERENCES lesson(id),
    learner_id uuid NOT NULL REFERENCES app_user(id),
    UNIQUE (lesson_id, learner_id)
);
CREATE TABLE training_attempt (
    id uuid PRIMARY KEY,
    assignment_id uuid NOT NULL REFERENCES lesson_assignment(id),
    revision_id uuid NOT NULL REFERENCES scenario_revision(id),
    status varchar(16) NOT NULL DEFAULT 'created' CHECK (status IN ('created','active','suspended','completed','failed')),
    card jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(card) = 'object'),
    card_status varchar(32) NOT NULL DEFAULT 'received',
    event_sequence bigint NOT NULL DEFAULT 0,
    speech_node text,
    started_at timestamptz,
    suspended_at timestamptz,
    paused_ms bigint NOT NULL DEFAULT 0 CHECK (paused_ms >= 0),
    finished_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_open_attempt_per_assignment ON training_attempt(assignment_id)
    WHERE status IN ('created','active','suspended');
CREATE TABLE attempt_event (
    attempt_id uuid NOT NULL REFERENCES training_attempt(id),
    event_id uuid NOT NULL,
    sequence bigint NOT NULL,
    actor_id uuid REFERENCES app_user(id),
    source varchar(16) NOT NULL CHECK (source IN ('operator','speech','system')),
    type varchar(64) NOT NULL,
    payload jsonb NOT NULL,
    elapsed_ms bigint NOT NULL CHECK (elapsed_ms >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (attempt_id, sequence),
    UNIQUE (attempt_id, event_id)
);
CREATE TABLE background_job (
    id uuid PRIMARY KEY,
    kind varchar(32) NOT NULL CHECK (kind IN ('compile_scenario','evaluate_attempt')),
    revision_id uuid REFERENCES scenario_revision(id),
    attempt_id uuid REFERENCES training_attempt(id),
    state varchar(16) NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','completed','failed')),
    tries integer NOT NULL DEFAULT 0,
    lease_token uuid,
    lease_until timestamptz,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    CHECK ((kind = 'compile_scenario' AND revision_id IS NOT NULL AND attempt_id IS NULL)
        OR (kind = 'evaluate_attempt' AND attempt_id IS NOT NULL AND revision_id IS NULL))
);
CREATE UNIQUE INDEX one_revision_compiler ON background_job(revision_id) WHERE state IN ('queued','running');
CREATE UNIQUE INDEX one_attempt_evaluator ON background_job(attempt_id) WHERE state IN ('queued','running');
CREATE INDEX background_job_dispatch ON background_job(state, created_at);
CREATE TABLE attempt_evaluation (
    attempt_id uuid PRIMARY KEY REFERENCES training_attempt(id),
    rubric_revision_id uuid NOT NULL REFERENCES scenario_revision(id),
    result jsonb NOT NULL,
    evaluator_version varchar(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE evaluation_review (
    id uuid PRIMARY KEY,
    attempt_id uuid NOT NULL REFERENCES training_attempt(id),
    teacher_id uuid NOT NULL REFERENCES app_user(id),
    result jsonb NOT NULL,
    reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_event (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id uuid REFERENCES app_user(id),
    action varchar(64) NOT NULL,
    entity_id uuid,
    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_event_created ON audit_event(created_at);

CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'History is append-only'; END $$;
CREATE TRIGGER immutable_attempt_event BEFORE UPDATE OR DELETE ON attempt_event
    FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_review BEFORE UPDATE OR DELETE ON evaluation_review
    FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_event
    FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
