#!/bin/bash
# Run the SQL semantics tests against a scratch local PostgreSQL.
# Requires: a local postgresql server (apt install postgresql) — no Docker needed.
#
# Sets up a scratch DB with a mocked Supabase auth schema (auth.users table +
# auth.uid() reading the request.jwt.claim.sub GUC), applies every migration in
# supabase/migrations/ in order, then runs each supabase/tests/*_test.sql /
# forwarding_semantics.sql file with ON_ERROR_STOP so any failed assertion
# (RAISE EXCEPTION 'FAIL ...') aborts with a nonzero exit code.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT/supabase/migrations"

sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<'SQL'
DROP DATABASE IF EXISTS events_test;
CREATE DATABASE events_test;
\c events_test
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  phone text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
DROP ROLE IF EXISTS anon;
DROP ROLE IF EXISTS authenticated;
DROP ROLE IF EXISTS service_role;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
SQL

# Files are piped via stdin (not psql -f): the shell opens them as the calling
# user, so the postgres user never needs read/traverse rights on the checkout
# (GitHub runners' workspace dirs are not traversable by other users).
for f in $(ls *.sql | sort); do
  sudo -u postgres psql -d events_test -v ON_ERROR_STOP=1 -q < "$f" > /dev/null 2>&1 || {
    echo "MIGRATION FAILED: $f"
    sudo -u postgres psql -d events_test -v ON_ERROR_STOP=1 < "$f"
    exit 1
  }
done
echo "migrations applied"

for t in "$REPO_ROOT"/supabase/tests/*_semantics.sql "$REPO_ROOT"/supabase/tests/*_test.sql; do
  [ -e "$t" ] || continue
  echo "=== $(basename "$t")"
  # Tests use fixed UUIDs and are not idempotent — run once, ON_ERROR_STOP
  # makes any SQL error or RAISE EXCEPTION abort with a nonzero exit code.
  out="$(sudo -u postgres psql -d events_test -v ON_ERROR_STOP=1 < "$t" 2>&1)" || {
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
