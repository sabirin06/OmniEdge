# Linux deployment

Use a dedicated Ubuntu VPS and point your domain at it. The repository includes [Nginx](../deploy/nginx.conf), [systemd](../deploy/omniedge.service), and a [production environment example](../backend/.env.production.example). The commands assume a checkout at `/opt/omniedge`, a supported Python/Node installation, and a PostgreSQL role and database created for OmniEdge. Bind PostgreSQL to loopback when it runs on the VPS. Keep port 5432 and Gunicorn port 8010 private. Set a real domain in the config and obtain a valid TLS certificate before enabling its HTTPS server block.

```sh
sudo apt install nginx postgresql python3-venv certbot
sudo useradd --system --home-dir /opt/omniedge --shell /usr/sbin/nologin omniedge
sudo install -d -m 0700 -o omniedge -g omniedge /var/lib/omniedge/evidence
cd /opt/omniedge
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt gunicorn
npm --prefix frontend ci
npm --prefix frontend run build
sudo install -m 0600 backend/.env.production.example /etc/omniedge.env
```

Set a generated Django secret, actual PostgreSQL credentials, allowed host, and HTTPS CSRF origin in `/etc/omniedge.env`. Percent-encode special characters in credentials inside the database URL. Use PostgreSQL TLS with the default `DATABASE_SSLMODE=require`, or configure the setting for your private connection. For an initial certificate, use your approved ACME client or run `certbot certonly --standalone -d YOUR_DOMAIN` with port 80 temporarily available.

```sh
sudo bash -c '
  set -a
  . /etc/omniedge.env
  set +a
  cd /opt/omniedge/backend
  export DJANGO_SETTINGS_MODULE=omni_edge.settings.production
  ../.venv/bin/python manage.py check --deploy
  ../.venv/bin/python manage.py migrate --noinput
  ../.venv/bin/python manage.py collectstatic --noinput
'
sudo install -m 0644 /opt/omniedge/deploy/omniedge.service /etc/systemd/system/omniedge.service
sudo install -m 0644 /opt/omniedge/deploy/nginx.conf /etc/nginx/sites-available/omniedge
sudoedit /etc/nginx/sites-available/omniedge
sudo ln -s /etc/nginx/sites-available/omniedge /etc/nginx/sites-enabled/omniedge
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable --now omniedge
sudo systemctl reload nginx
```

Nginx overwrites the forwarded protocol header and Django trusts it from the loopback proxy. Private evidence remains outside Nginx's web roots. Run the seed command only on a separate fictional environment. The documented demo credentials are public and unsuitable as production passwords.

From outside the VPS, verify that `https://YOUR_DOMAIN/`, a direct React route, `/api/v1/health/` and login work. Restart Gunicorn and verify existing cases and evidence still load. Inspect logs with `journalctl -u omniedge` and Nginx access/error logs. Back up both PostgreSQL (`pg_dump -Fc`) and the private evidence directory. Test restoration with `pg_restore` and restored evidence in a separate database and storage location.
