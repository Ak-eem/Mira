#!/usr/bin/env bash
# Build a throwaway database from every migration, then run the SQL tests.
# Usage: DATABASE_URL=postgres://postgres:postgres@localhost:5432/mira_test supabase/tests/run.sh
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL to an empty, disposable Postgres database}"
cd "$(dirname "$0")/../.."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/support/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "migration: $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tenant_isolation.sql
