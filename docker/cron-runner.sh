#!/bin/sh
# One-shot cron runner: hits the app's own cron endpoint with CRON_SECRET.
# Requires CRON_SECRET in the environment (set on the Coolify application).
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 300 \
  -H "Authorization: Bearer ${CRON_SECRET}" "http://127.0.0.1:3000$1")
echo "[cron] $1 -> HTTP $CODE"
