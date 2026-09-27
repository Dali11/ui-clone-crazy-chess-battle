#!/bin/sh
# Start the busybox cron daemon (schedules in /etc/crontabs/root), then the app.
# -l 8 verbose, -L /dev/stdout so cron job output lands in container logs.
crond -b -l 8 -L /dev/stdout
echo "[entrypoint] crond started: $(grep -c . /etc/crontabs/root) jobs (UTC)"
exec node server.js
