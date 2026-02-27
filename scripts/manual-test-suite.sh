#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUITE_PATH="$ROOT_DIR/manual-tests/cloud_manual_regression.md"
REPORT_TEMPLATE_PATH="$ROOT_DIR/manual-tests/manual_test_report_template.md"

STRICT=0
START_SERVER=0
PORT=8081

while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict)
      STRICT=1
      shift
      ;;
    --start)
      START_SERVER=1
      shift
      ;;
    --port)
      PORT="${2:-8081}"
      shift 2
      ;;
    --help|-h)
      echo "Usage: bash ./scripts/manual-test-suite.sh [--strict] [--start] [--port <port>]"
      echo
      echo "  --strict   Exit non-zero if preflight checks fail."
      echo "  --start    Start Expo web server after preflight checks."
      echo "  --port     Expo web server port (default: 8081)."
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

if [[ ! -f "$SUITE_PATH" ]]; then
  echo "Missing manual suite file: $SUITE_PATH"
  exit 1
fi

if [[ ! -f "$REPORT_TEMPLATE_PATH" ]]; then
  echo "Missing manual report template file: $REPORT_TEMPLATE_PATH"
  exit 1
fi

ISSUES=0

echo "Manual regression preflight"
echo "==========================="

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "WARN: .env not found at repo root."
  echo "      The app can render, but auth/data flows will fail without Supabase values."
  ((ISSUES+=1))
else
  echo "OK: .env found."
fi

if [[ -z "${EXPO_PUBLIC_SUPABASE_URL:-}" ]]; then
  echo "INFO: EXPO_PUBLIC_SUPABASE_URL not exported in current shell."
else
  echo "OK: EXPO_PUBLIC_SUPABASE_URL exported in shell."
fi

if [[ -z "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  echo "INFO: EXPO_PUBLIC_SUPABASE_ANON_KEY not exported in current shell."
else
  echo "OK: EXPO_PUBLIC_SUPABASE_ANON_KEY exported in shell."
fi

echo
echo "Manual suite doc: $SUITE_PATH"
echo "Report template:  $REPORT_TEMPLATE_PATH"
echo
echo "Recommended flow:"
echo "1) Read the suite doc."
echo "2) Start app: npx expo start --web --port $PORT"
echo "3) Run scenarios with computer-use."
echo "4) Save evidence and complete the report template."

if [[ $STRICT -eq 1 && $ISSUES -gt 0 ]]; then
  echo
  echo "Strict mode enabled and preflight checks reported issues."
  exit 2
fi

if [[ $START_SERVER -eq 1 ]]; then
  echo
  echo "Starting Expo web server on port $PORT..."
  exec npx expo start --web --port "$PORT"
fi
