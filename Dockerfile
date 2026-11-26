# OmniEdge single-container image for free container hosts (Back4app Containers, Render).
# Nginx serves the React build and proxies /api/ and /admin/ to Gunicorn/Django
# inside the same container. Build context: repository root (this folder).
# Local Docker Compose (compose.yaml) is unaffected and keeps using
# backend/Dockerfile and frontend/Dockerfile.

FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=omni_edge.settings.production \
    PORT=10000

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx gettext-base \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

RUN groupadd --gid 1000 omniedge \
    && useradd --uid 1000 --gid omniedge --home-dir /app --shell /usr/sbin/nologin omniedge

COPY --chown=omniedge:omniedge backend/ /app/
COPY --from=frontend --chown=omniedge:omniedge /frontend/dist /srv/frontend
COPY --chown=omniedge:omniedge deploy/container/nginx.conf.template /etc/omniedge/nginx.conf.template
COPY --chown=omniedge:omniedge deploy/container/start.sh /usr/local/bin/omniedge-start
RUN chmod 0755 /usr/local/bin/omniedge-start \
    && sed -i 's/\r$//' /usr/local/bin/omniedge-start \
    && SECRET_KEY=build-only DATABASE_URL=postgresql://build:build@localhost/build \
       python manage.py collectstatic --noinput \
    && chown -R omniedge:omniedge /app/staticfiles

USER omniedge
EXPOSE 10000
CMD ["/usr/local/bin/omniedge-start"]
