#!/bin/sh
# Ночной бэкап: дамп базы и копия файлов MinIO в отдельное место в РК.
# crontab сервера:  15 2 * * *  /opt/tu-online/scripts/backup.sh >> /var/log/tu-backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
STAMP=$(date +%Y-%m-%d_%H%M)
DEST=${BACKUP_DIR:-/backup/tu-online}
mkdir -p "$DEST/db" "$DEST/files"
docker compose exec -T db pg_dump -U tu -d tu_online -Fc > "$DEST/db/tu_online_$STAMP.dump"
docker compose run --rm -v "$DEST/files:/backup" --entrypoint sh minio-init \
  -c "mc alias set local http://minio:9000 \$S3_ACCESS_KEY \$S3_SECRET_KEY >/dev/null && mc mirror --overwrite local/\${S3_BUCKET:-tu-online} /backup"
# Храним 14 последних дампов
ls -1t "$DEST/db"/*.dump | tail -n +15 | xargs -r rm -f
echo "backup ok: $STAMP"
