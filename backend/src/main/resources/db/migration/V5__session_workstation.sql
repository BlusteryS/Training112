ALTER TABLE auth_session ADD COLUMN workstation varchar(4) NOT NULL DEFAULT '0';
ALTER TABLE auth_session ADD CONSTRAINT valid_workstation CHECK (workstation ~ '^[0-9]{1,4}$');
ALTER TABLE auth_session ALTER COLUMN workstation DROP DEFAULT;
