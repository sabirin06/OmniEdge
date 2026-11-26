# OmniEdge API image: Django REST Framework served by Gunicorn.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=omni_edge.settings.production

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# Run as an unprivileged user. The static and media folders are created here so
# the named Docker volumes mounted over them inherit this ownership.
RUN groupadd --system omniedge \
    && useradd --system --gid omniedge --home-dir /app --shell /usr/sbin/nologin omniedge \
    && mkdir -p /app/staticfiles /app/media/private_evidence \
    && chown -R omniedge:omniedge /app

COPY --chown=omniedge:omniedge . .

USER omniedge
EXPOSE 8000

CMD ["sh", "-c", "exec gunicorn omni_edge.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-2} --timeout ${GUNICORN_TIMEOUT:-60} --access-logfile - --error-logfile -"]
