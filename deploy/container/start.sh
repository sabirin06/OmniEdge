#!/bin/bash
# Start OmniEdge (Back4app / Render / any container host): migrate, optionally seed demo data, then run
# Gunicorn (private, 127.0.0.1:8000) and Nginx (public, $PORT) together.
set -euo pipefail

export PORT="${PORT:-10000}"
first_allowed="${ALLOWED_HOSTS:-localhost}"
first_allowed="${first_allowed%%,*}"
first_allowed="${first_allowed// /}"
# A wildcard entry such as ".b4a.run" needs a concrete name for the health check.
case "$first_allowed" in .*) first_allowed="health${first_allowed}" ;; esac
export OMNIEDGE_PRIMARY_HOST="${SPACE_HOST:-${RENDER_EXTERNAL_HOSTNAME:-$first_allowed}}"

envsubst '${PORT} ${OMNIEDGE_PRIMARY_HOST}' \
    < /etc/omniedge/nginx.conf.template > /tmp/nginx.conf

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    python manage.py migrate --noinput
fi

if [ "${SEED_DEMO:-false}" = "true" ]; then
    echo "SEED_DEMO=true: loading fictional demo data (set it back to false afterwards)."
    python manage.py seed_demo
fi

gunicorn omni_edge.wsgi:application \
    --bind 127.0.0.1:8000 \
    --workers "${GUNICORN_WORKERS:-2}" \
    --timeout "${GUNICORN_TIMEOUT:-60}" \
    --access-logfile - --error-logfile - &

nginx -e stderr -c /tmp/nginx.conf -g 'daemon off;' &

# Exit (so Render restarts the service) if either process stops.
wait -n
exit $?
