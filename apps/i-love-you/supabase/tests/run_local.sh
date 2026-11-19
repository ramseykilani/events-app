#!/bin/bash
# Run I Love You's SQL semantics tests against a scratch local PostgreSQL.
# Same runner as apps/events/supabase/tests/run_local.sh (scratch DB, mocked
# auth schema, every migration in order, ON_ERROR_STOP assertions), plus one
# step Events does per test file: after the migrations it grants the table
# privileges hosted Supabase grants by default, so SET LOCAL ROLE checks
# exercise RLS — the real boundary — rather than a missing grant.
# Self-sufficient: installs and starts PostgreSQL if the machine lacks it
# (same logic as CI's "Set up PostgreSQL" step) — no Docker needed.
#
# Sets up a scratch DB with a mocked Supabase auth schema (auth.users table +
# auth.uid() reading the request.jwt.claim.sub GUC), applies every migration in
# supabase/migrations/ in order, then runs each supabase/tests/*_test.sql
# file with ON_ERROR_STOP so any failed assertion
# (RAISE EXCEPTION 'FAIL ...') aborts with a nonzero exit code.
set -euo pipefail

# Fresh cloud-agent VMs have no PostgreSQL at all (the environment install
# script only runs npm install); a fresh install also leaves the cluster
# stopped. Mirror .github/workflows/full-suite.yml's setup so the suite runs
# identically everywhere.
if ! command -v psql >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    echo "PostgreSQL not found; installing (sudo apt-get install -y postgresql)..."
    sudo apt-get update && sudo apt-get install -y postgresql
  else
    echo "PostgreSQL is not installed. Install it (e.g. brew install postgresql) and re-run." >&2
    exit 1
  fi
fi
sudo systemctl start postgresql 2>/dev/null || sudo service postgresql start 2>/dev/null || true
sudo -u postgres psql -c 'SELECT 1' >/dev/null

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Drop the scratch DB on exit: Events' runner drops and recreates the shared
# anon/authenticated roles, which fails while another database still holds
# grants to them — a leftover iloveyou_test would break `npm run test:sql`
# for Events.
cleanup() { sudo -u postgres psql -q -c 'DROP DATABASE IF EXISTS iloveyou_test' >/dev/null 2>&1 || true; }
trap cleanup EXIT
cd "$REPO_ROOT/supabase/migrations"

sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<'SQL'
DROP DATABASE IF EXISTS iloveyou_test;
CREATE DATABASE iloveyou_test;
\c iloveyou_test
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  phone text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
-- Roles are cluster-wide and Events' runner drops and recreates them, so
-- create them only when missing (never drop: events_test may hold grants).
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;
SQL

# Files are piped via stdin (not psql -f): the shell opens them as the calling
# user, so the postgres user never needs read/traverse rights on the checkout
# (GitHub runners' workspace dirs are not traversable by other users).
for f in $(ls *.sql | sort); do
  sudo -u postgres psql -d iloveyou_test -v ON_ERROR_STOP=1 -q < "$f" > /dev/null 2>&1 || {
    echo "MIGRATION FAILED: $f"
    sudo -u postgres psql -d iloveyou_test -v ON_ERROR_STOP=1 < "$f"
    exit 1
  }
done
# Hosted Supabase grants every table in public to anon/authenticated and
# leaves access control to RLS. Mirror that, so RLS is what the tests pin.
sudo -u postgres psql -d iloveyou_test -v ON_ERROR_STOP=1 -q <<'SQL'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
SQL
echo "migrations applied"

for t in "$REPO_ROOT"/supabase/tests/*_semantics.sql "$REPO_ROOT"/supabase/tests/*_test.sql; do
  [ -e "$t" ] || continue
  echo "=== $(basename "$t")"
  # Tests use fixed UUIDs and are not idempotent — run once, ON_ERROR_STOP
  # makes any SQL error or RAISE EXCEPTION abort with a nonzero exit code.
  out="$(sudo -u postgres psql -d iloveyou_test -v ON_ERROR_STOP=1 < "$t" 2>&1)" || {
    echo "$out"
    echo "TEST FAILED: $t"
    exit 1
  }
  echo "$out" | grep -E "PASS|FAIL|ERROR" || true
  if echo "$out" | grep -q "FAIL"; then
    echo "TEST FAILED: $t"
    exit 1
  fi
done

echo "ALL SQL TESTS PASSED"
