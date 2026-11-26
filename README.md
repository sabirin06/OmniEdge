# OmniEdge

OmniEdge is a multi-tenant security operations prototype. It follows fictional telemetry from tenant onboarding and detection through alert triage, evidence, containment tasks, closure, and reporting.

## Run locally

Install Python 3.12 or newer, Node.js 22.12 or newer, and PostgreSQL. Create a PostgreSQL database and copy `backend/.env.example` to `backend/.env`. Set `DATABASE_URL` for your own PostgreSQL instance. Keep the local file out of Git.

In the first terminal, from the repository root:

```powershell
cd backend
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

Use `seed_demo` only in a fictional demo database. It creates the demo accounts and resets their demo passwords. To obtain a source key for an ingestion demonstration, register a source and save the key when it appears.

In the second terminal:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev -- --configLoader runner
```

- App: http://localhost:5173/
- API documentation: http://127.0.0.1:8000/api/v1/docs/
- Health: http://127.0.0.1:8000/api/v1/health/

## Run with Docker (production stack)

The Docker stack runs PostgreSQL 16, the Django API under Gunicorn, and Nginx serving the React build and proxying `/api/` and `/admin/`. Data lives in named volumes: `pgdata` (database), `evidence` (private evidence files) and `staticfiles`. Nginx is published only on `127.0.0.1:8080`; on a server a host Nginx adds HTTPS in front of it.

```powershell
copy .env.example .env
```

Edit `.env`: set `SECRET_KEY` and `POSTGRES_PASSWORD` to fresh random values (`openssl rand -hex 32`) and use the same password inside `DATABASE_URL`. Never commit `.env`.

```sh
docker compose config --quiet
docker compose build
docker compose up -d db
docker compose run --rm api python manage.py migrate
docker compose run --rm api python manage.py collectstatic --noinput
docker compose run --rm api python manage.py seed_demo   # fictional demo data only
docker compose up -d
docker compose ps
```

- App: http://localhost:8080/
- Health: http://localhost:8080/api/v1/health/
- API documentation: http://localhost:8080/api/v1/docs/

Useful commands: `docker compose logs --tail=100 api`, `docker compose restart`, `docker compose down` (keeps data). **Never run `docker compose down -v`** unless you intend to delete the database and evidence volumes.

Optional account-email worker (only after SMTP values are set in `.env`): `docker compose --profile mail up -d mail`.

### Deploy to Back4app Containers (free, no card) with Neon PostgreSQL (free)

The public demo runs as **one Docker container** built from the root [Dockerfile](Dockerfile): Nginx serves the React build on port 10000 and proxies `/api/` and `/admin/` to Gunicorn/Django inside the same container. Back4app builds it from GitHub and serves it on a `https://<app>.b4a.run` URL with HTTPS. PostgreSQL is a free Neon project. The container filesystem is not persistent, so evidence files are stored privately in PostgreSQL (`EVIDENCE_STORAGE=database`, table `incidents_evidence_blob`) and are only downloadable through the permission-checked evidence API. Local Docker Compose is unchanged and keeps evidence on its volume.

1. **Neon** (neon.tech, free): create a project and copy the **direct** connection string (Connect → turn off connection pooling; the host must not contain `-pooler`).
2. **Back4app** (back4app.com → Containers, free, no card): sign up with GitHub, choose **Deploy a container**, install the Back4app GitHub app for the repository, pick branch `main`, **Root** `./` (the root Dockerfile), auto-deploy on.
3. Environment variables:

| Variable | Value |
|---|---|
| `SECRET_KEY` | long random value (`openssl rand -hex 32`) |
| `DATABASE_URL` | Neon direct connection string |
| `DATABASE_SSLMODE` | `require` |
| `ALLOWED_HOSTS` | `.b4a.run` (leading dot = any b4a.run subdomain) |
| `CSRF_TRUSTED_ORIGINS` | `https://*.b4a.run` |
| `HTTPS_ENABLED` | `true` |
| `EVIDENCE_STORAGE` | `database` |
| `GUNICORN_WORKERS` | `1` (free plan has 256 MB RAM) |
| `ACCOUNT_TRUST_PROXY_IP` | `true` |
| `SEED_DEMO` | `true` for the first deploy only, then `false` |

4. Create the app and wait for the build. Check `https://<app>.b4a.run/api/v1/health/` → `{"status":"ok","database":"connected"}`. After the first successful start, set `SEED_DEMO=false` (otherwise demo passwords are reset on every restart). Each start runs `migrate` (idempotent). Once you know the exact URL you can replace the wildcard values with it.

**Back4app/Neon limitations:** the free container has 0.25 shared CPU and 256 MB RAM (the image uses about 70 MB with one worker), so it is slow under load; Back4app does not document uptime or sleep rules for the free plan. Neon Free suspends an idle database (short delay on the first query) and has limited storage (about 0.5 GB), which also holds evidence (5 MB per file). No SLA or managed backups: export with `pg_dump` against the Neon URL. Account email needs SMTP settings (`EMAIL_*`), not configured by default.

Test the single-container image locally (uses the Compose database):

```sh
docker build -t omniedge-container .
docker run --rm -p 127.0.0.1:10000:10000 --network omniedge_default \
  -e SECRET_KEY=local-test -e DATABASE_URL=postgresql://omniedge:<password>@db:5432/omniedge \
  -e DATABASE_SSLMODE=disable -e HTTPS_ENABLED=false -e EVIDENCE_STORAGE=database \
  -e ALLOWED_HOSTS=localhost omniedge-container
```

### Alternative: Render (free) with Neon PostgreSQL (free)

Note: Render's dashboard and `*.onrender.com` apps are unreachable from some networks; check before choosing it. The same root Dockerfile runs as one free Render web service using [render.yaml](render.yaml) (New → Blueprint). Set `DATABASE_URL`, and the other variables from the table above except `ALLOWED_HOSTS`/`CSRF_TRUSTED_ORIGINS`, which are filled in automatically from `RENDER_EXTERNAL_HOSTNAME`; `GUNICORN_WORKERS` can be `2` (512 MB RAM). The free service sleeps after about 15 minutes without traffic.

### Alternative: self-hosted Ubuntu server (e.g. Oracle Cloud Always Free + DuckDNS + Let's Encrypt)

1. Create an Always Free Ubuntu 24.04 VM with a public IPv4 and SSH key. In the VCN security list allow TCP 80 and 443 from `0.0.0.0/0` and TCP 22 (ideally only from your IP). Keep 5432, 8000 and 8080 closed.
2. Point a DuckDNS subdomain (`yourname.duckdns.org`) at the VM's public IP.
3. On the server:

```sh
sudo apt update && sudo apt install -y git curl ca-certificates nginx certbot python3-certbot-nginx
curl -fsSL https://get.docker.com | sudo sh        # Docker Engine + Compose plugin
# Oracle Ubuntu images ship iptables rules that block 80/443 by default:
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

git clone https://github.com/sabirin06/OmniEdge.git && cd OmniEdge
cp .env.example .env && chmod 600 .env && nano .env
```

In the server `.env` use new secrets, `ALLOWED_HOSTS=yourname.duckdns.org`, `CSRF_TRUSTED_ORIGINS=https://yourname.duckdns.org` and keep `HTTPS_ENABLED=False` for now. Then run the same `docker compose` commands as above with `sudo`.

4. Host Nginx — create `/etc/nginx/sites-available/omniedge`:

```nginx
server {
    listen 80;
    server_name yourname.duckdns.org;
    client_max_body_size 6m;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

```sh
sudo ln -s /etc/nginx/sites-available/omniedge /etc/nginx/sites-enabled/omniedge
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d yourname.duckdns.org --redirect
sudo certbot renew --dry-run          # renewal runs automatically via the certbot systemd timer
```

5. Set `HTTPS_ENABLED=True` in `.env`, then `sudo docker compose up -d --force-recreate api nginx` and check `curl -f https://yourname.duckdns.org/api/v1/health/`.

**Updates:** back up first (`sudo docker compose exec db pg_dump -U omniedge omniedge > backup.sql`), then `git pull --ff-only origin main`, `sudo docker compose build`, run `migrate` and `collectstatic` again, and `sudo docker compose up -d`.

**Known limitations:** the Always Free VM (1 GB RAM on the AMD shape) suits a demo, not production load; free capacity and account verification are not guaranteed by Oracle. DuckDNS is a free dynamic-DNS service with no SLA. Account email (password reset/verification codes) needs SMTP credentials, which are not configured by default. The `seed_demo` passwords are public demo values — change them or do not seed on a publicly reachable instance used for anything beyond a demo. There are no automated backups; take `pg_dump` and evidence-volume backups yourself.

## Verify and demonstrate

Run `python manage.py test` from `backend` and `npm.cmd run build -- --configLoader runner` from `frontend`.

Sign in as Platform Admin, create an organization and create its Customer Admin under Users. Sign in as that admin, register an asset and connect a source. Create a tenant SOC Lead, sign in as that lead, and create an enabled rule for `login_failed` with conditions `{"metadata__failed_attempts":{"gte":5}}`. Return to the Customer Admin and run one failed-login simulation. Expect one saved event and one alert. Run a successful-login simulation and expect one saved event and no alert from that rule.

The alert detail links to the saved event. Refresh each list to confirm persistence. See [Day 1 verification](docs/day-1-verification.md) and the [branding register](docs/branding.md).

See the [API guide](docs/api.md) and [Linux deployment guide](docs/deployment.md). The README development setup uses two terminals. For an alternate Django port, set `OMNIEDGE_API_PROXY` before starting Vite.

## GitHub handoff

This workspace already has local Git history. Before publishing, rotate any real credentials previously committed and inspect all history and tracked files. The supplied assessment documents should be shared only as authorized. Use a private repository for initial collaboration and give reviewers access according to the submission instructions.

## Collect local Windows Event Logs

The optional [Windows collector](windows-collector/collector.py) uses the existing Log Sources and Events workflow. Keep the simulator for assessment demos. The collector is for local monitoring and only reads the System and Application channels. Normal Windows event messages can contain hostnames, usernames, and other local details. Run it only against an OmniEdge instance where you want those records stored.

### Register this computer

1. Start Django and Vite as described above. Test Django at http://127.0.0.1:8000/api/v1/health/.
2. As the tenant's Customer Admin, open **Assets → Register Asset**. Run `hostname` in PowerShell and use that computer name as the asset's hostname.
3. Open **Log Sources → Connect Log Source**. Select **Windows Event Forwarding**, link the Windows asset, and enable the source. Save the displayed source key and note the **Source ID** in the list. Use **Rotate Key** if you missed the key when it was displayed.

### Start, check, and stop

Use Python 3.10 or newer and Windows PowerShell (included in Windows 10/11). Start in a normal PowerShell window from the repository root:

```powershell
python windows-collector/collector.py --api http://127.0.0.1:8000 --source-id 7
```

Replace `7` with your registered source ID. Enter the source key at the hidden prompt. For unattended runs, inject it as the `OMNIEDGE_SOURCE_KEY` environment variable from your secret store. Avoid placing it in a command-line argument, checked-in file, or terminal history. Local HTTP is allowed only for loopback addresses. Remote origins require HTTPS, and the collector does not forward credentials on redirects.

- The first run starts at the current end of each selected channel by default. To also upload recent history, pass `--backfill 5` on the first run to collect up to five existing records per channel.
- Use `--channel System` to read just System, or `--channel Application` to read just Application. By default, it reads both.
- Collection runs continuously by default. After each normal pass it waits 15 seconds. Use `--interval 60` for a 60-second wait. A full batch triggers another pass after one second to catch up. Press **Ctrl+C** to stop, or use `--once` for one pass.
- To inspect local status without entering a secret or reading events, run `python windows-collector/collector.py --source-id 7 --status`. Use the same `--api` argument as the running collector if you changed it. The output includes the last authenticated connection check, last successful read, last accepted delivery, and any error. When a poll has no new entries, the channel reports **idle** while the authenticated connection can still be **connected**.
- Check **Log Sources → Last Event Received** and **Events** in OmniEdge after an event is accepted. If the collector reports a source or hostname mismatch, check the ID and the hostname of the asset attached to that source. For a channel access error, verify that the same Windows account can open it in Event Viewer.

The collector saves its per-channel cursor under `%LOCALAPPDATA%\OmniEdge\windows-collector`. It advances only after Django accepts an event or confirms it was already saved. A record's computer, channel, record ID, and original timestamp produce its stable ID. Windows retention can remove events before the collector can read them. Detected log resets reinitialize the cursor using the configured backfill.

### Match Windows events with an existing rule

The **Events** screen receives types such as `windows.system.42`. The event payload includes the original timestamp and message plus computer, channel, provider, Windows event ID, record ID, and numeric level.

| Windows level | OmniEdge severity |
|---|---|
| 0 ? LogAlways | INFO |
| 1 ? Critical | CRITICAL |
| 2 ? Error | HIGH |
| 3 ? Warning | MEDIUM |
| 4 ? Information | INFO |
| 5 ? Verbose | LOW |
| Custom numeric level | INFO internally; original number in JSON |
| Missing level | INFO internally; missing level stored as null |

The raw value is saved as `metadata.level`. For new records a missing level is stored as `null`. Older collector versions stored missing levels as 0, so existing level-0 rows can include either case. INFO is the fallback for levels with no standard severity, and custom or missing values remain distinguishable in the JSON payload. Use the event type and provider when defining a rule for such records. [Microsoft Windows Event Levels](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.eventing.reader.standardeventlevel?view=netframework-4.8.1)


As SOC Lead, create a Detection Rule with an event type copied from a received Windows event. Optionally add a condition such as `{"metadata__provider":"Your Provider Name"}`. When a new event matches an enabled rule in the same tenant, the existing engine creates an alert. Rules are evaluated on ingestion, so create the rule before the next matching event arrives.

Tests:

```powershell
python -m unittest discover -s windows-collector -v
cd backend
python manage.py test apps.monitoring.tests.test_windows_collector
```

### Severity in the Events table

**Severity** shows the highest non-dismissed alert severity, then the saved manual assessment if one exists, then the normalized event severity. Informational or unknown levels without a higher classification display as **Low**. The table and severity filter offer Low, Medium, High, and Critical. Open **JSON** to inspect the original Windows level, event data, and any saved review notes. Displaying a fallback severity does not create an alert. Enabled rules create alerts when new events meet their conditions.

Install the starter rules into a selected tenant from the backend directory:

```powershell
python manage.py install_windows_rules --tenant-id 1
```

Use the ID of your own tenant. Rerunning the command preserves existing rules with the same names. Existing events are kept as recorded. Rules evaluate new events on arrival.

| Signal | Provider | OmniEdge risk |
|---|---|---|
| Application hang · Application 1002 | Application Hang | Low |
| Single failed logon · Security 4625 | Microsoft-Windows-Security-Auditing | Medium |
| Volume requires offline check · System 98 | Ntfs or Microsoft-Windows-Ntfs | High |
| Unusable filesystem structure · System 55 | Ntfs or Microsoft-Windows-Ntfs | Critical |

These are starting priorities for a workstation. A single failed logon is a review signal. Windows can record it at level 0, which is still preserved when OmniEdge assigns Medium risk. The collector reads System and Application only. Security 4625 is exercised using a clearly labeled synthetic fixture in the PostgreSQL test database. No Windows authentication attempts or system changes are needed. [Microsoft Event 4625](https://learn.microsoft.com/windows/security/threat-protection/auditing/event-4625) · [Microsoft storage event guidance](https://learn.microsoft.com/troubleshoot/windows-server/backup-and-storage/troubleshoot-data-corruption-and-disk-errors)

Run the fixture tests from the backend directory with `python manage.py test apps.monitoring.tests.test_windows_risk`.

Account enrollment and recovery require SMTP and the account mail worker. Follow the [account security setup](docs/account-security.md) for the environment variables and deployment commands.
