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
