#!/bin/bash
# Run this locally whenever DATABASE_URL needs to be applied to Neon.
# Usage: DATABASE_URL="postgresql://..." bash apps/web/scripts/setup-db.sh

set -e
cd "$(dirname "$0")/.."

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. Export it first:"
  echo "  export DATABASE_URL='postgresql://...'"
  exit 1
fi

echo "DATABASE_URL prefix: ${DATABASE_URL:0:30}..."
echo "Running prisma generate..."
npx prisma generate

echo "Running prisma db push..."
npx prisma db push

echo "Verifying tables..."
npx prisma db execute --stdin <<'SQL'
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
SQL

echo "Done."
