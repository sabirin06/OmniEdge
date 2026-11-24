# OmniEdge

OmniEdge runs a fictional multi-tenant SOC workflow. Day 1 covers onboarding, assets, log sources, synthetic events, detection rules, and alerts.

## Run locally

Create a PostgreSQL database and copy `backend/.env.example` to `backend/.env`. Set `DATABASE_URL` for your own PostgreSQL instance. Keep the local file out of Git.

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

## Verify Day 1

Run `python manage.py test` from `backend` and `npm.cmd run build -- --configLoader runner` from `frontend`.

Sign in as Platform Admin, create an organization and create its Customer Admin under Users. Sign in as that admin, register an asset and connect a source. Create a tenant SOC Lead, sign in as that lead, and create an enabled rule for `login_failed` with conditions `{"metadata__failed_attempts":{"gte":5}}`. Return to the Customer Admin and run one failed-login simulation. Expect one saved event and one alert. Run a successful-login simulation and expect one saved event and no alert from that rule.

The alert detail links to the saved event. Refresh each list to confirm persistence. See [Day 1 verification](docs/day-1-verification.md) and the [branding register](docs/branding.md).

## GitHub handoff

This workspace already has local Git history. Before publishing, rotate any real credentials previously committed and inspect all history and tracked files. The supplied assessment documents should be shared only as authorized. Use a private repository for initial collaboration and give reviewers access according to the submission instructions.
