#!/bin/sh
# Nightly database backup loop used by the `backup` service in docker-compose.yml.
while true; do
  stamp=$(date +%Y%m%d-%H%M)
  pg_dump -Fc > "/backups/dairy-${stamp}.dump" && echo "backup written: dairy-${stamp}.dump"
  # Keep only the last RETENTION_DAYS days of dumps
  find /backups -name 'dairy-*.dump' -mtime "+${RETENTION_DAYS:-30}" -exec rm -f {} \;
  sleep 86400
done
