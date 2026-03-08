#!/bin/bash
# Update Highway to latest version
# Usage: ./scripts/update.sh

set -euo pipefail
cd /opt/highway

echo "🔄 Pulling latest code..."
git pull origin main

echo "📦 Installing dependencies..."
bun install

echo "🗄️  Running migrations..."
bun run db:migrate

echo "🔨 Rebuilding..."
docker compose -f docker-compose.prod.yml build app

echo "🚀 Restarting..."
docker compose -f docker-compose.prod.yml up -d app

# Wait for health check
echo "⏳ Waiting for app to be healthy..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:4000/health > /dev/null 2>&1; then
    echo "✅ Highway updated and healthy!"
    exit 0
  fi
  sleep 2
done

echo "⚠️  App started but health check timed out — check logs:"
echo "  docker compose -f docker-compose.prod.yml logs -f app"
