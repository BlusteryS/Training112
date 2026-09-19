CREATE TABLE app_user (
    id uuid PRIMARY KEY,
    login varchar(32) NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role varchar(16) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_login CHECK (login ~ '^[a-z0-9_]{3,32}$')
);

CREATE TABLE auth_session (
    token_hash char(64) PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);
CREATE INDEX auth_session_user_id_idx ON auth_session(user_id);
CREATE INDEX auth_session_expires_at_idx ON auth_session(expires_at);

CREATE TABLE auth_rate_limit (
    key char(64) PRIMARY KEY,
    attempts integer NOT NULL,
    expires_at timestamptz NOT NULL
);
CREATE INDEX auth_rate_limit_expires_at_idx ON auth_rate_limit(expires_at);
