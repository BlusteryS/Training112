CREATE TABLE teaching_material (
    id uuid PRIMARY KEY,
    teacher_id uuid NOT NULL REFERENCES app_user(id),
    title varchar(200) NOT NULL,
    filename varchar(200) NOT NULL,
    media_type varchar(80) NOT NULL,
    content bytea NOT NULL,
    byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 98304),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_setting (
    key varchar(64) PRIMARY KEY,
    value varchar(64) NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES app_user(id)
);

INSERT INTO platform_setting(key, value) VALUES
    ('password_min_length', '8'),
    ('session_hours', '168');

CREATE TABLE backup_export (
    id uuid PRIMARY KEY,
    actor_id uuid NOT NULL REFERENCES app_user(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    sha256 varchar(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    byte_size integer NOT NULL CHECK (byte_size > 0)
);
