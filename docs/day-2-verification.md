# Day 2 verification

Date: 25 November 2026

## Workflow

1. Generate a fictional failed-login event and open its alert in the Alert Queue. As SOC Analyst, claim the alert, update severity, enter a triage note, and escalate. Use a separate alert to demonstrate dismissal with a reason.
2. Open the resulting case. Verify the linked alert and owner. Move the case to Investigating and add a timeline note. Upload a fictional text or PDF attachment and download it from the Evidence tab.
3. As SOC Lead, create an enabled playbook with an ordered required step. Apply it from the case's Tasks tab and select an assignee. Apply it a second time and verify that the task count stays the same.
4. Move the case to Containment. As the assigned analyst, start and complete the task with a note. Confirm that resolution fails while a required task is incomplete and succeeds after recording a resolution summary.
5. As SOC Lead, close the resolved case. Confirm the timestamp and actor in the timeline, the resolved status of the linked alert, and the change in dashboard workload.
6. Generate a new dated report. Verify that it counts actual tenant events, alerts and case outcomes, and that the older snapshot retains its original metrics. Search the Audit Log for the recorded actions.

## Verification performed

- PostgreSQL migration applied to the local database. A uniqueness constraint protects each incident and playbook-step pair.
- Full backend suite passed with 19 tests, including Day 1 regression tests. Day 2 tests verify the API lifecycle, concurrent duplicate escalation, rejection of invalid evidence, non-public download routes, tenant isolation, mandatory tasks and Lead-only closure, and persisted reports.
- Vite production build passed. Vite reported a bundle-size warning. The running Vite app and Django health and docs routes responded over HTTP.
- OpenAPI validates with zero errors. Serializer and enum naming warnings remain.
- A complete browser click-through remains unverified. Browser automation returned an access-denied error. The previously seeded Lead credential was also rejected by the existing local database. Fresh database tests exercise the seeded accounts without changing any local passwords.
- New and freshly seeded reports use calculated metrics. Earlier demo snapshots retain their original values with a legacy label.

## API examples

All paths are relative to `/api/v1/`. Authenticate with a tenant session and send a CSRF token on writes.

| Workflow action | Request |
| --- | --- |
| Claim alert | `POST alerts/{alert}/claim/` |
| Update severity and notes | `POST alerts/{alert}/triage/` with `{"severity":"high","notes":"Reviewed demo telemetry"}` |
| Escalate | `POST alerts/{alert}/escalate/` |
| Add timeline note | `POST incidents/{case}/timeline/` with `{"message":"Reviewed demo findings"}` |
| Upload evidence | `POST incidents/{case}/evidence/` as multipart with `file` and optional `description` |
| Apply playbook | `POST incidents/{case}/apply-playbook/` with `playbook_id` and optional `assignee` |
| Complete task | `POST incidents/{case}/actions/{task}/transition/` with `{"status":"completed","completion_notes":"Verified demo finding"}` |
| Resolve case | `POST incidents/{case}/transition/` with `{"status":"resolved","resolution_summary":"Completed the demo response"}` |
| Close case | `POST incidents/{case}/transition/` with `{"status":"closed"}` as SOC Lead |
| Generate report | `POST reports/` with `title`, `period_start`, and `period_end` |

## Login and save follow-up

The development services were restarted. Vite's proxy returned a healthy response from Django and PostgreSQL. Five of the eight existing demo accounts accepted their original demo credentials over the proxy. The original seed credentials for Horizon's Customer Admin, SOC Lead, and second Analyst were rejected by the existing database. Their passwords were left intact.

A rollback-only check against local PostgreSQL authenticated one existing account per role using its password and CSRF. Platform Admin created a tenant, Customer Admin created an asset, SOC Lead saved a playbook, and SOC Analyst created a case. Each request returned 201, each saved record was read back, and logout succeeded. Each write without its CSRF token returned 403. The workflow's role boundaries still apply. Customer Admin can manage onboarding and generate reports, while incident response writes belong to Analysts and Leads.

## Day 2 file inventory and code

### Modified ? [.gitignore](../.gitignore#L20)

Keeps the private evidence directory out of Git.

```text
private_evidence/
```

### Modified ? [backend/apps/core/management/commands/seed_demo.py](../backend/apps/core/management/commands/seed_demo.py#L392)

Calculates a fresh demo report from the seeded records.

```python
        # 9. Report snapshot calculated from demo records
        period_end = timezone.localdate()
        period_start = period_end - timedelta(days=30)
        Report.objects.get_or_create(
            tenant=horizon,
            title="Demo SOC Operations Snapshot",
            defaults={
                "period_start": period_start,
                "period_end": period_end,
                "generated_by": h_lead,
                "metrics": lambda: report_metrics(horizon, period_start, period_end),
            },
```

### Modified ? [backend/apps/core/permissions.py](../backend/apps/core/permissions.py#L85)

Separates responder writes, tenant-admin review, and report access.

```python
class IsIncidentResponder(BasePermission):
    """Tenant responders write workflow records; Customer Admins can review them."""
    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated or user.tenant_id is None:
            return False
        if request.method in SAFE_METHODS and user.role == "customer_admin":
            return True
        return user.role in ("soc_analyst", "soc_lead")
```

### Modified ? [backend/apps/core/signals.py](../backend/apps/core/signals.py#L15)

Adds playbook changes to the shared audit history.

```python
    "incidents.playbook": ("name", "category", "enabled"),
    "monitoring.alert": ("status", "severity", "assignee_id", "incident_id"),
}
```

### Modified ? [backend/apps/core/views.py](../backend/apps/core/views.py#L297)

Enables server-side audit search by action, record, or actor.

```python
class AuditLogListView(generics.ListAPIView):
    search_fields = ["action", "entity_type", "entity_id", "actor__email", "actor__full_name"]
    permission_classes = [IsSOCLead]
    serializer_class = AuditLogSerializer
    ordering_fields = ["timestamp"]
    ordering = ["-timestamp"]

```

### Modified ? [backend/apps/incidents/models.py](../backend/apps/incidents/models.py#L184)

Prevents duplicate tasks for an incident and playbook step.

```python
        constraints = [models.UniqueConstraint(fields=["incident", "playbook_step"], name="unique_incident_playbook_step")]
        indexes = [
            models.Index(fields=["incident", "status"]),
```

### Modified ? [backend/apps/incidents/serializers.py](../backend/apps/incidents/serializers.py#L77)

Validates tenant membership, resolution prerequisites, evidence, step position, and task inputs.

```python
        if st == "resolved":
            if not attrs.get("resolution_summary"):
                raise serializers.ValidationError({"resolution_summary": "A resolution summary is required."})
            if incident.actions.filter(required=True).exclude(status="completed").exists():
                raise serializers.ValidationError({"new_status": "Complete all required tasks before resolving."})
        return attrs

```

### Modified ? [backend/apps/incidents/signals.py](../backend/apps/incidents/signals.py#L84)

Tracks prior state per case instance and audits owner, status, and severity changes.

```python
    if "severity" in old and old["severity"] != instance.severity:
        changes["severity"] = {"from": old["severity"], "to": instance.severity}

    if changes:
        AuditLog.objects.create(
            tenant=instance.tenant,
            actor=actor,
            action="incident.updated",
            entity_type="Incident",
            entity_id=str(instance.id),
```

### Modified ? [backend/apps/incidents/views.py](../backend/apps/incidents/views.py#L147)

Implements atomic case closure, evidence upload/download, playbook application, task assignment, and report snapshots.

```python
        if new_status == "closed":
            incident.closed_at = timezone.now()
            incident.closed_by = request.user
        incident.save()
        if new_status == "closed":
            for alert in incident.alerts.select_for_update().filter(tenant=incident.tenant):
                alert.status = "resolved"
                alert.save(update_fields=["status", "updated_at"])
        return Response(IncidentSerializer(incident).data)

```

### Modified ? [backend/apps/monitoring/views.py](../backend/apps/monitoring/views.py#L457)

Locks alert writes, preserves claims, and prevents duplicate escalation.

```python
class AlertEscalateView(APIView):
    permission_classes = [IsIncidentResponder]

    @extend_schema(request=AlertEscalateSerializer, responses={201: IncidentSerializer})
    @transaction.atomic
    def post(self, request, pk):
        from apps.incidents.models import Incident
        try:
            alert = Alert.objects.select_for_update().get(pk=pk, tenant=get_tenant(request.user))
        except Alert.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if alert.incident_id or alert.status not in ("new", "in_review"):
            return Response({"detail": "This alert cannot be escalated again or from its current status."}, status=status.HTTP_400_BAD_REQUEST)

```

### Modified ? [backend/omni_edge/settings/base.py](../backend/omni_edge/settings/base.py#L130)

Configures the private evidence location, 5 MB limit, and allowed formats.

```python
EVIDENCE_ROOT = BASE_DIR / "private_evidence"
EVIDENCE_MAX_SIZE_MB = 5
EVIDENCE_ALLOWED_TYPES = [
    "image/png", "image/jpeg",
    "application/pdf",
    "text/plain", "text/csv",
    "application/json",
]
```

### Modified ? [backend/omni_edge/urls.py](../backend/omni_edge/urls.py#L8)

Removes direct development media serving so evidence is retrieved through the authenticated endpoint.

```python
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.core.urls")),
    path("api/v1/", include("apps.monitoring.urls")),
    path("api/v1/", include("apps.incidents.urls")),
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
```

### Modified ? [frontend/src/api/auth.ts](../frontend/src/api/auth.ts#L7)

Sends the CSRF token returned by Django with sign-in.

```typescript
export const authApi = {
  getCsrf: () => api.get<{ csrfToken: string }>('/auth/csrf/'),
  login:   (data: LoginPayload, csrfToken: string) => api.post<LoginResponse>('/auth/login/', data, {
    headers: { 'X-CSRFToken': csrfToken },
  }),
  logout:  () => api.post('/auth/logout/'),
  me:      () => api.get<AuthUser>('/auth/me/'),
};
```

### Modified ? [frontend/src/api/client.ts](../frontend/src/api/client.ts#L10)

Preserves an explicit CSRF header and supplies the current cookie token for later writes.

```typescript
api.interceptors.request.use(async (config) => {
  const method = config.method?.toLowerCase() ?? '';
  if (['post', 'put', 'patch', 'delete'].includes(method) && !config.headers.has('X-CSRFToken')) {
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='));
    if (cookie) {
      config.headers.set('X-CSRFToken', cookie.trim().slice('csrftoken='.length));
    }
  }
  return config;
});
```

### Modified ? [frontend/src/api/incidents.ts](../frontend/src/api/incidents.ts#L22)

Connects case transitions, linked alerts, evidence downloads, playbooks, and actions to the backend routes.

```typescript
  transition: (id: number, status: string, resolution_summary?: string) =>
    api.post(`/incidents/${id}/transition/`, { status, resolution_summary }),
  linkedAlerts: (id: number) => api.get(`/incidents/${id}/linked-alerts/`),
  applyPlaybook: (id: number, playbook_id: number, assignee?: number) =>
    api.post(`/incidents/${id}/apply-playbook/`, { playbook_id, assignee }),
  downloadEvidence: (id: number, evidenceId: number) =>
    api.get<Blob>(`/incidents/${id}/evidence/${evidenceId}/download/`, { responseType: 'blob' }),
  assignTask: (id: number, taskId: number, assignee: number | null) =>
    api.post(`/incidents/${id}/actions/${taskId}/transition/`, { assignee }),

```

### Modified ? [frontend/src/api/playbooks.ts](../frontend/src/api/playbooks.ts#L22)

Adds ordered step creation and editing requests.

```typescript
  createStep: (id: number, data: StepPayload) => api.post(`/playbooks/${id}/steps/`, data),
  updateStep: (id: number, stepId: number, data: StepPayload) => api.patch(`/playbooks/${id}/steps/${stepId}/`, data),
  delete: (id: number) => api.delete(`/playbooks/${id}/`),
};
```

### Modified ? [frontend/src/contexts/AuthContext.tsx](../frontend/src/contexts/AuthContext.tsx#L32)

Waits for successful CSRF initialization before login.

```tsx
  const login = async (email: string, password: string) => {
    const { data: { csrfToken } } = await authApi.getCsrf();
    const { data } = await authApi.login({ email: email.trim(), password }, csrfToken);
    setUser(data.user);
  };
```

### Modified ? [frontend/src/pages/Alerts.tsx](../frontend/src/pages/Alerts.tsx#L20)

Shows triage controls only to responder roles and on actionable alerts.

```tsx
  const canRespond = user?.role === "soc_analyst" || user?.role === "soc_lead";
```

### Modified ? [frontend/src/pages/Audit.tsx](../frontend/src/pages/Audit.tsx#L19)

Uses paginated server search and shows the recorded actor email.

```tsx
      const res = await api.get('/audit-logs/', { params: { page, search } });
      const data = res.data.results ? res.data.results : (Array.isArray(res.data) ? res.data : []);
      setLogs(data);
      setCount(res.data.count);
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
```

### Modified ? [frontend/src/pages/IncidentDetail.tsx](../frontend/src/pages/IncidentDetail.tsx#L123)

Provides case editing, transitions, timeline notes, evidence upload/download, and task actions.

```tsx
        {available.includes('resolved') && <div className="form-group">
          <label>Resolution summary <textarea value={summary} onChange={e => setSummary(e.target.value)} /></label>
        </div>}
        <div className="filter-bar">
          {available.map(status => <button key={status} disabled={busy || (status === 'resolved' && !summary.trim())} className="btn btn-primary"
            onClick={() => {
              if (status === 'closed' && !window.confirm('Close this incident and resolve its linked alerts?')) return;
              void mutate(() => incidentsApi.transition(incidentId, status, summary.trim()), 'Case status updated');
            }}>{status === 'closed' ? 'Close incident' : `Move to ${status}`}</button>)}
        </div>
      </div>}

```

### Modified ? [frontend/src/pages/Incidents.tsx](../frontend/src/pages/Incidents.tsx#L33)

Searches and paginates cases on the server; opens newly saved cases directly.

```tsx
  const listing = useApi(() => incidentsApi.list({ page, search, status: statusFilter }), [page, search, statusFilter]);
  const filtered: any[] = listing.data?.results ?? [];
  const loading = listing.loading;

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const { data } = await incidentsApi.create({ title, description, severity });
      toast('success', 'Incident created');
      navigate(`/incidents/${data.id}`);
    } catch (err) {
      toast('error', requestError(err, 'Could not create incident.'));
```

### Modified ? [frontend/src/pages/Login.tsx](../frontend/src/pages/Login.tsx#L25)

Distinguishes rejected credentials, CSRF failures, and unavailable services.

```tsx
      const status = isAxiosError(err) ? err.response?.status : undefined;
      if (status === 401) setError('Sign-in rejected. Check your credentials or ask your administrator about account access.');
      else if (status === 403) setError('The sign-in security check failed. Reload this page and try again.');
      else setError('Could not reach the sign-in service. Check that Django is running on port 8000.');
    } finally {
```

### Modified ? [frontend/src/pages/Playbooks.tsx](../frontend/src/pages/Playbooks.tsx#L59)

Provides template and ordered-step forms with API validation feedback.

```tsx
      {[...(book.steps ?? []), null].map((step, index, steps) => (
        <form key={step?.id ?? 'new'} className="card" onSubmit={event => save(event, data => {
          const payload = { position: Number(data.get('position')), title: String(data.get('title')),
            instructions: String(data.get('instructions')), required: data.has('required') };
          return step ? playbooksApi.updateStep(book.id, step.id, payload) : playbooksApi.createStep(book.id, payload);
        }, step ? 'Step updated' : 'Step added', !step)}>
          <h3>{step ? `Step ${step.position}` : 'Add a step'}</h3>
          <div className="form-group"><label>Position <input type="number" name="position" min={1} required defaultValue={step?.position ?? ((steps[index - 1]?.position ?? 0) + 1)} /></label></div>
          <div className="form-group"><label>Title <input name="title" required maxLength={255} defaultValue={step?.title} /></label></div>
          <div className="form-group"><label>Instructions <textarea name="instructions" required defaultValue={step?.instructions} /></label></div>
```

### Modified ? [frontend/src/pages/Reports.tsx](../frontend/src/pages/Reports.tsx#L93)

Displays stored metrics, handles legacy demo snapshots, and supports searchable reports.

```tsx
      {selectedReport && !selectedReport.metrics?.events && <p>Legacy demo snapshot. Generate a new report for current database figures.</p>}
      {selectedReport?.metrics?.incidents && <p>Snapshot workload ? {selectedReport.metrics.open_workload.alerts} open alerts ? {selectedReport.metrics.open_workload.incidents} open incidents</p>}
      {selectedReport?.metrics?.incidents && <p>Incident outcomes ? {Object.entries(selectedReport.metrics.incidents.by_status).map(([key, value]) => `${key}: ${value}`).join(' ? ')}</p>}
```

### Modified ? [frontend/vite.config.ts](../frontend/vite.config.ts#L6)

Keeps the development server on its configured port instead of silently switching.

```typescript
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
```

### Created ? [backend/apps/incidents/migrations/0002_action_unique_incident_playbook_step.py](../backend/apps/incidents/migrations/0002_action_unique_incident_playbook_step.py#L15)

Applies the incident and playbook-step uniqueness constraint in PostgreSQL.

```python
    operations = [
        migrations.AddConstraint(
            model_name='action',
            constraint=models.UniqueConstraint(fields=('incident', 'playbook_step'), name='unique_incident_playbook_step'),
        ),
    ]
```

### Created ? [backend/apps/incidents/reporting.py](../backend/apps/incidents/reporting.py#L38)

Calculates tenant and date-range metrics for saved report snapshots.

```python
    detection = alerts_qs.aggregate(duration=Avg(F("created_at") - F("event__received_at")))["duration"]
    resolution = incidents_qs.filter(resolved_at__isnull=False).aggregate(
        duration=Avg(F("resolved_at") - F("created_at")),
    )["duration"]
    return {
        "mean_time_to_detect_minutes": round(detection.total_seconds() / 60, 2) if detection is not None else None,
        "mean_time_to_respond_minutes": round(resolution.total_seconds() / 60, 2) if resolution is not None else None,
        "period": {"start": str(period_start), "end": str(period_end)},
        "events": {"total": events_qs.count(), "by_severity": event_counts},
        "alerts": {"total": alerts_qs.count(), "by_severity": alert_severity},
        "incidents": {"total": incidents_qs.count(), "by_status": incident_outcomes},
        "open_workload": {"alerts": open_alerts, "incidents": open_incidents},
    }
```

### Created ? [backend/apps/incidents/tests/test_day_two_workflow.py](../backend/apps/incidents/tests/test_day_two_workflow.py#L140)

Tests the workflow, role boundaries, evidence privacy, report snapshots, and concurrent escalation.

```python
        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(executor.map(lambda _: escalate(), range(2)))
        self.assertCountEqual(outcomes, [201, 400])
        self.assertEqual(Incident.objects.count(), 1)
        alert.refresh_from_db()
        self.assertEqual(alert.status, "escalated")
        self.assertIsNotNone(alert.incident_id)
```

### Created ? [docs/day-2-verification.md](../docs/day-2-verification.md#L5)

Records the checklist, API examples, verification results, and this change inventory.

```text
## Workflow

1. Generate a fictional failed-login event and open its alert in the Alert Queue. As SOC Analyst, claim the alert, update severity, enter a triage note, and escalate. Use a separate alert to demonstrate dismissal with a reason.
2. Open the resulting case. Verify the linked alert and owner. Move the case to Investigating and add a timeline note. Upload a fictional text or PDF attachment and download it from the Evidence tab.
```
