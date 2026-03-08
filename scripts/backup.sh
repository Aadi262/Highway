#!/bin/bash
# Backup Highway platform database + all user databases
# Usage: ./scripts/backup.sh
# Runs via cron: 0 3 * * * /opt/highway/scripts/backup.sh >> /var/log/highway-backup.log 2>&1

set -euo pipefail
BACKUP_DIR="/opt/highway/backups/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

echo "🔄 Starting backup to $BACKUP_DIR..."

# Platform DB
echo "📦 Backing up platform database..."
docker exec highway-postgres pg_dump -U highway highway | gzip > "$BACKUP_DIR/highway-platform.sql.gz"
echo "✅ Platform DB backed up"

# All user databases (find containers with highway.database label)
for container in $(docker ps --filter "label=highway.database" --format "{{.Names}}"); do
  IMAGE=$(docker inspect --format='{{.Config.Image}}' "$container")

  if [[ "$IMAGE" == postgres* ]]; then
    DB_USER=$(docker exec "$container" printenv POSTGRES_USER 2>/dev/null || echo "postgres")
    DB_NAME=$(docker exec "$container" printenv POSTGRES_DB 2>/dev/null || echo "postgres")
    docker exec "$container" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/${container}.sql.gz"
    echo "✅ Backed up postgres container: $container"

  elif [[ "$IMAGE" == mysql* ]] || [[ "$IMAGE" == mariadb* ]]; then
    DB_PASS=$(docker exec "$container" printenv MYSQL_ROOT_PASSWORD 2>/dev/null || \
              docker exec "$container" printenv MARIADB_ROOT_PASSWORD 2>/dev/null || echo "")
    docker exec "$container" mysqldump --all-databases -p"$DB_PASS" 2>/dev/null | gzip > "$BACKUP_DIR/${container}.sql.gz"
    echo "✅ Backed up mysql/mariadb container: $container"

  elif [[ "$IMAGE" == mongo* ]]; then
    docker exec "$container" mongodump --archive --gzip > "$BACKUP_DIR/${container}.archive.gz"
    echo "✅ Backed up mongodb container: $container"

  elif [[ "$IMAGE" == redis* ]]; then
    docker exec "$container" redis-cli BGSAVE
    sleep 2
    docker cp "$container:/data/dump.rdb" "$BACKUP_DIR/${container}.rdb"
    echo "✅ Backed up redis container: $container"
  fi
done

# Cleanup backups older than 7 days
find /opt/highway/backups/ -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true

TOTAL=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "✅ All backups saved to $BACKUP_DIR ($TOTAL)"
