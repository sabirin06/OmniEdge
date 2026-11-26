# OmniEdge API

The API uses the `/api/v1/` prefix. [Swagger UI](http://127.0.0.1:8000/api/v1/docs/) and [OpenAPI YAML](http://127.0.0.1:8000/api/v1/schema/) are served by Django. Use the same origin as the React application when exercising session-authenticated endpoints.

| Resource | Operations |
|---|---|
| `auth/csrf/`, `auth/login/`, `auth/me/`, `auth/logout/` | Bootstrap CSRF, sign in, read/update profile, sign out |
| `auth/password/request/`, `auth/password/confirm/` | POST an email to request recovery. POST email, code, and password to complete a reset. |
| `auth/verify/request/`, `auth/verify/confirm/` | POST an email to request a fresh enrollment code. POST email and code to verify ownership. |
| `auth/security/` | GET MFA status, POST authenticator enrollment or removal, DELETE to revoke all account sessions |
| `tenants/`, `roles/`, `users/` | Platform and tenant administration as authorized. Tenant status uses `suspend/` and `activate/` |
| `assets/`, `log-sources/` | Inventory and source registration. Rotate source with `log-sources/{id}/rotate-key/` |
| `ingest/events/`, `simulator/generate/`, `events/` | Source-key ingestion, session-authenticated synthetic generation, event list/detail |
| `rules/` | Rule catalog and Lead-managed changes, including `enable/` and `disable/` |
| `alerts/` | List/detail and POST actions `claim/`, `triage/`, `dismiss/`, `escalate/` under an alert ID |
| `incidents/` | List/create/detail/update, `transition/`, `linked-alerts/`, `timeline/`, `evidence/`, `apply-playbook/`, `actions/` under a case ID |
| `incidents/{id}/evidence/{eid}/download/` | Authorized private file download |
| `incidents/{id}/actions/{aid}/transition/` | Assignment or task state change |
| `playbooks/`, `playbooks/{id}/steps/` | Lead playbook and ordered step management |
| `dashboard/`, `reports/`, `audit-logs/`, `health/` | Role-scoped metrics, saved reports, audit history, service health |

Send `X-CSRFToken` and its cookie on login, verification, recovery, and state-changing session requests. Login rotates the CSRF token. An MFA-enabled sign-in returns 428 when a second factor is required. Resubmit the credentials with `otp` set to an authenticator or recovery code. A 202 on a code request confirms acceptance of the request. See [Account security operations](account-security.md) for mail delivery and session behavior.

Browser users can run this example in DevTools on the local fictional demo app after signing in as a Horizon Lead.

```js
const token = (await (await fetch('/api/v1/auth/csrf/')).json()).csrfToken;
const response = await fetch('/api/v1/reports/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRFToken': token },
  body: JSON.stringify({ title: 'Demo snapshot', period_start: '2026-11-25', period_end: '2026-11-26' }),
});
console.log(response.status, await response.json());
```

For a registered synthetic source, set `OMNIEDGE_SOURCE_KEY` in the current PowerShell environment and send a fictional record. Keep the key out of source, logs, and recordings. Retrying the same normalized payload is deduplicated.

```powershell
$body = @{
  event_type = 'login_failed'
  severity = 'high'
  message = 'Fictional demo failed sign-in'
  occurred_at = [DateTime]::UtcNow.ToString('o')
  metadata = @{ failed_attempts = 7 }
} | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8000/api/v1/ingest/events/ -Method Post `
  -Headers @{ 'X-Source-Key' = $env:OMNIEDGE_SOURCE_KEY } -ContentType application/json -Body $body
```

List responses use `count`, `next`, `previous` and `results`. Use `?page=2`, `?search=term` and endpoint-specific filters documented in Swagger. Successful creation generally returns 201. Validation errors return 400, with `errors` and `field_codes` when raised through DRF validation. Session or source authentication failures can return 401 or 403. A tenant-scoped detail that is unavailable returns 404. Conflicting state can return 409. Health returns 200 with a working database query and 503 when it fails.

## Live report analytics and export

Use `GET /api/v1/reports/analytics/` for totals, daily activity, and severity/status breakdowns. Use the same filters with `GET /api/v1/reports/export/` and add `export=pdf` or `export=csv`.

- `period_start` and `period_end` are inclusive dates in the server reporting timezone. The maximum range is 366 days.
- `report_type` accepts `overview`, `events`, `alerts`, or `incidents`. `severity` and `status` are optional. Status filters only include record types that use the selected status.
- Events are counted by receipt date and displayed risk severity. Alerts and incidents are counted by creation date, with their current severity and status.
- The API scopes all reads, exports, and snapshots to the signed-in tenant. An explicitly supplied `tenant` must match that tenant.
- SOC Analysts, SOC Leads, and Customer Admins can view and export. SOC Leads and Customer Admins can save an immutable snapshot with `POST /api/v1/reports/` by supplying a title and the same filters.

For the Detailed Records table, use `GET /api/v1/reports/records/` with the same filters, plus optional `search`, `ordering`, and `page`. Search matches record IDs, titles/messages, and type-specific context. For example, `ordering=-record_date` returns newest records first. Pages contain up to 25 records.

Use `GET /api/v1/reports/records/export/` with the same search, ordering, and filters plus `export=csv` or `export=pdf`. Exports include all matching rows. PDF supports up to 1,000 rows. Use CSV or narrow the filters for larger reports.
