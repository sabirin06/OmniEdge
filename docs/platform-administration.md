# Platform administration

Platform Admins land on the original dashboard layout. Platform activity is available from the dashboard, while infrastructure and security controls live under Settings. Global operational lists show metadata such as tenant, status, and timestamp. Customer event payloads, case content, evidence, and source secrets remain behind tenant operations permissions.

- **Tenants, Users, and Roles** provide onboarding, account edits, state changes, and managed roles based on the existing role policies. User Management offers live Total, Active, Inactive and Disabled filters, role and tenant selectors, details and paginated activity history. Activate, Deactivate, Disable, and Enable appear for applicable accounts and require confirmation.
- **Configuration** persists the support timeout, notification contact, and maintenance notice. Email transport information comes from deployment settings. The integration register stores service ownership and operational notes.
- **Detection Templates** validates event type, severity and JSON conditions against the tenant rule format. Templates are staged for review and do not change the tenant engine or deploy rules automatically.
- **Security Activity and Audit Logs** show authentication activity and privileged operations. Failed sign-ins are recorded without the submitted credentials, and support audit entries identify the administrator, scope and reason.
- **System Health and Platform Reports** use current database counts, a database probe, the latest ingestion timestamp and recent activity. Reports offer usage, security, tenant, and performance views with CSV downloads.
- **Backup & Recovery and Maintenance** track verification, recovery procedures, and work status. Actual backup, restore, package updates, and worker monitoring use infrastructure outside the application. No shell commands or filesystem paths are executed from the work-item interface.

## Support access

Select **Support Access** on an organization or **Login as User** on an active customer account. Enter a reason before starting. The session is bound to the administrator and their browser session, expires automatically, and can be ended manually. Affected signed-in customers see a support notice within 15 seconds. For an account, the actual tenant workspace loads under the target role and tenant permissions. The administrator remains the authenticated actor. A banner shows the scope and expiry and offers Return to Super Admin. Support allows regular record views and blocks mutations, private file downloads and bulk exports. It issues no customer session or password. Organization-level support continues to show a scoped administrative preview.

## API

All control-plane APIs use the `/api/v1/platform/` prefix. Requests for records, reports, work items, configuration, access changes and support require Platform Admin. The notice endpoint only returns the maintenance message and applicable support-notice flag to a signed-in user.

| Endpoint | Purpose |
|---|---|
| `GET /`, `GET /reports/`, `GET /health/` | Metrics, report snapshot, live probes |
| `GET /{section}/?page=1` | Filtered and paginated platform records |
| `GET /user-counts/`, `GET /users/{id}/activity/` | Account status counts and paginated audit history |
| `GET/PUT /settings/` | Platform settings |
| `GET/POST /work/{kind}/`, `GET/PATCH /work/{kind}/{id}/` | Work queue and registry |
| `POST /access/{users-or-tenants}/{id}/` | State change with `confirm: true` |
| `POST/GET/DELETE /support/` | Start, view, or end a scoped session |
| `GET /notice/` | Applicable announcements and support notice |

Apply the Django migrations before opening the control plane. The support and registry data are in PostgreSQL.
