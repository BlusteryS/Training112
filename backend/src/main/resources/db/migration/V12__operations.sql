INSERT INTO platform_setting(key,value) VALUES
  ('service_speech_enabled','1'),
  ('dds_phone_enabled','1'),
  ('audit_retention_days','365'),
  ('backup_interval_hours','24'),
  ('backup_retention_count','3');

ALTER TABLE backup_export ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE backup_export ADD COLUMN source varchar(16) NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual','automatic'));
ALTER TABLE backup_export ADD COLUMN filename varchar(200);
DROP TRIGGER immutable_audit ON audit_event;
CREATE TRIGGER immutable_audit BEFORE UPDATE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
