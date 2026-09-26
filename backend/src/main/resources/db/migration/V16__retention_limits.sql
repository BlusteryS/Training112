UPDATE platform_setting
SET value = GREATEST(value::integer, 186)::text
WHERE key = 'audit_retention_days' AND value::integer < 186;

UPDATE platform_setting
SET value = LEAST(value::integer, 24)::text
WHERE key = 'backup_interval_hours' AND value::integer > 24;
