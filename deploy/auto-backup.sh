#!/bin/sh
set -eu

while :; do
  interval=$(psql -Atqc "SELECT value FROM platform_setting WHERE key='backup_interval_hours'" || true)
  retention=$(psql -Atqc "SELECT value FROM platform_setting WHERE key='backup_retention_count'" || true)
  due=$(psql -Atqc "SELECT NOT EXISTS (SELECT 1 FROM backup_export WHERE source='automatic' AND created_at > now() - interval '${interval:-24} hours')" || true)
  if [ "$due" = t ]; then
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    name="training112-$stamp.dump"
    temporary="/backups/$name.tmp"
    if pg_dump -Fc -f "$temporary"; then
      mv "$temporary" "/backups/$name"
      hash=$(sha256sum "/backups/$name" | cut -d ' ' -f 1)
      size=$(wc -c < "/backups/$name" | tr -d ' ')
      psql -v ON_ERROR_STOP=1 -qc "INSERT INTO backup_export(id,actor_id,sha256,byte_size,source,filename) VALUES (gen_random_uuid(),NULL,'$hash',$size,'automatic','$name')"
      find /backups -maxdepth 1 -type f -name 'training112-*.dump' | sort -r | tail -n +$((${retention:-3} + 1)) | while IFS= read -r old; do
        rm -- "$old"
        psql -v ON_ERROR_STOP=1 -qc "DELETE FROM backup_export WHERE source='automatic' AND filename='$(basename "$old")'"
      done
    else
      rm -f "$temporary"
      echo "Automatic database backup failed" >&2
    fi
  fi
  sleep 300
done
