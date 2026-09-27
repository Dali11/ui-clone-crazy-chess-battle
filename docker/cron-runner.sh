#!/bin/sh
# One-shot cron runner: hits the app's own cron endpoint with CRON_SECRET.
# Writes the result to PID 1's stdout so it shows up in container logs.
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 300 \
  -H "Authorization: Bearer ${CRON_SECRET}" "http://127.0.0.1:3000$1")
echo "[cron] $1 -> HTTP $CODE" > /proc/1/fd/1 2>/dev/null || echo "[cron] $1 -> HTTP $CODE"
