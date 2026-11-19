#!/bin/bash
# The local backend the e2e suite runs against — the real thing, not a test
# double: the Supabase CLI's local stack (Postgres with every migration, Auth
# with phone OTP via [auth.sms.test_otp], PostgREST, Realtime, Storage, Edge
# Runtime serving supabase/functions) plus a LiveKit dev server in Docker for
# calls. Nothing here touches a hosted service.
#
#   bash e2e/stack.sh up      start (idempotent), reset the database, build
#                             the web bundle against the local stack
#   bash e2e/stack.sh reset   reset the database only (the setup project
#                             runs this, so every run pairs fresh people)
#   bash e2e/stack.sh down    stop everything
#
# Needs Docker. Run from apps/i-love-you (npm run stack:up does).
set -euo pipefail
cd "$(dirname "$0")/.."
SB="npx supabase"
STATE=.e2e
mkdir -p "$STATE"

# GoTrue only issues phone OTPs with a provider enabled; test_otp numbers
# never reach it, so these are inert placeholders for the LOCAL stack.
export ILY_LOCAL_TWILIO_ACCOUNT_SID=AC00000000000000000000000000000000
export ILY_LOCAL_TWILIO_MESSAGE_SERVICE_SID=MG00000000000000000000000000000000
export ILY_LOCAL_TWILIO_AUTH_TOKEN=local-placeholder

# LiveKit's --dev mode uses the documented public dev key pair
# (devkey / secret). Local only; the hosted project's keys are function
# secrets (SETUP.md -> LiveKit).
LIVEKIT_ENV="$STATE/functions.env"
printf 'LIVEKIT_URL=ws://127.0.0.1:7880\nLIVEKIT_API_KEY=devkey\nLIVEKIT_API_SECRET=secret\n' > "$LIVEKIT_ENV"

case "${1:-up}" in
  up)
    $SB start >/dev/null
    $SB db reset >/dev/null
    if ! docker ps --format '{{.Names}}' | grep -q '^ily-livekit$'; then
      docker rm -f ily-livekit >/dev/null 2>&1 || true
      docker run -d --name ily-livekit -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
        livekit/livekit-server:v1.9 --dev --bind 0.0.0.0 --node-ip 127.0.0.1 >/dev/null
    fi
    if [ -f "$STATE/functions.pid" ] && kill -0 "$(cat "$STATE/functions.pid")" 2>/dev/null; then :; else
      nohup $SB functions serve --env-file "$LIVEKIT_ENV" > "$STATE/functions.log" 2>&1 &
      echo $! > "$STATE/functions.pid"
    fi
    eval "$($SB status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY)=')"
    printf 'EXPO_PUBLIC_SUPABASE_URL=%s\nEXPO_PUBLIC_SUPABASE_ANON_KEY=%s\n' "$API_URL" "$PUBLISHABLE_KEY" > "$STATE/web.env"
    # The bundle bakes the URL in, so build against the local stack.
    env $(cat "$STATE/web.env" | xargs) npx expo export --platform web --output-dir "$STATE/dist" >/dev/null
    # Wait for the functions runtime to answer.
    for _ in $(seq 1 30); do
      code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$API_URL/functions/v1/livekit-token" || true)
      [ "$code" = "200" ] && break
      sleep 1
    done
    echo "stack up: $API_URL (web build in $STATE/dist)"
    ;;
  reset)
    $SB db reset >/dev/null
    # Restarted containers: wait for Auth to answer before specs sign in.
    eval "$($SB status -o env | grep -E '^(API_URL)=')"
    for _ in $(seq 1 60); do
      [ "$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/auth/v1/health" || true)" = "401" ] && break
      [ "$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/auth/v1/health" || true)" = "200" ] && break
      sleep 1
    done
    ;;
  down)
    [ -f "$STATE/functions.pid" ] && kill "$(cat "$STATE/functions.pid")" 2>/dev/null || true
    docker rm -f ily-livekit >/dev/null 2>&1 || true
    $SB stop >/dev/null || true
    echo "stack down"
    ;;
  *)
    echo "usage: e2e/stack.sh up|reset|down" >&2
    exit 1
    ;;
esac
