#!/bin/sh
# One-shot cron runner: hits the app's own cron endpoint with CRON_SECRET,
# then posts a heartbeat (path, HTTP status, duration) to /api/jobs/heartbeat
# so the admin "Jobs" tab can show live health of every scheduled job.
# Writes the result to PID 1's stdout so it shows up in container logs.

START=$(date +%s)
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 300 \
  -H "Authorization: Bearer ${CRON_SECRET}" "http://127.0.0.1:3000$1")
END=$(date +%s)
DUR=$((END - START))
# curl prints 000 on connect failure/timeout — normalize so the JSON
# heartbeat body stays valid and 0 = "did not run".
CODE=$((CODE + 0))

echo "[cron] $1 -> HTTP $CODE (${DUR}s)" > /proc/1/fd/1 2>/dev/null || echo "[cron] $1 -> HTTP $CODE (${DUR}s)"

# Heartbeat — best-effort, never fails the job itself.
curl -s -o /dev/null --max-time 20 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -X POST "http://127.0.0.1:3000/api/jobs/heartbeat" \
  -d "{\"job\": \"$1\", \"http\": $CODE, \"duration_ms\": $((DUR * 1000))}"
