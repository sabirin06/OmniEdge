import csv
import io
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import Tenant, User
from apps.incidents.models import Incident
from apps.monitoring.models import Alert, Event, LogSource, Rule


class ReportAnalyticsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name="Horizon reports", code="RPT")
        cls.other = Tenant.objects.create(name="Atlas reports", code="RPT2")
        cls.analyst = User.objects.create(email="rpt-analyst@example.test", role="soc_analyst", tenant=cls.tenant)
        cls.lead = User.objects.create(email="rpt-lead@example.test", role="soc_lead", tenant=cls.tenant)
        cls.platform = User.objects.create(email="rpt-platform@example.test", role="platform_admin")
        for tenant in (cls.tenant, cls.other):
            source = LogSource.objects.create(tenant=tenant, name="Fictional source")
            event = Event.objects.create(tenant=tenant, source=source, event_type="fixture", severity="medium",
                                         message="Fictional report fixture", occurred_at=timezone.now())
            rule = Rule.objects.create(tenant=tenant, name="Report fixture rule", event_type="unused", severity="high")
            Alert.objects.create(tenant=tenant, rule=rule, event=event, title="Fixture", severity="high", status="new")
            Incident.objects.create(tenant=tenant, reference=f"FIX-{tenant.pk}", title="Fixture", severity="medium", status="open")
            Event.objects.filter(pk=event.pk).update(received_at=timezone.now() - timedelta(days=2))

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.analyst)
        today = timezone.localdate().isoformat()
        self.filters = {"period_start": today, "period_end": today}

    def test_date_dimensions_status_and_tenant(self):
        path = "/api/v1/reports/analytics/"
        response = self.client.get(path, self.filters)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["totals"], {"events": 0, "alerts": 1, "incidents": 1})
        self.assertEqual(response.data["daily"], [{"date": self.filters["period_start"], "events": 0, "alerts": 1, "incidents": 1}])
        filtered = self.client.get(path, {**self.filters, "status": "new", "severity": "high"})
        self.assertEqual(filtered.data["totals"], {"alerts": 1})
        start = (timezone.localdate() - timedelta(days=3)).isoformat()
        events = self.client.get(path, {**self.filters, "period_start": start, "report_type": "events", "severity": "high"})
        self.assertEqual(events.data["totals"], {"events": 1})
        self.assertEqual(events.data["breakdown"], [{"type": "events", "dimension": "severity", "value": "high", "count": 1}])
        self.assertEqual(self.client.get(path, {**self.filters, "tenant": self.other.pk}).status_code, 403)
        self.assertEqual(self.client.get(path, {**self.filters, "report_type": "events", "status": "new"}).status_code, 400)
        self.assertEqual(self.client.get(path, {**self.filters, "period_start": "2020-01-01"}).status_code, 400)

    def test_filtered_snapshot_permissions_and_persistence(self):
        payload = {**self.filters, "title": "Filtered saved view", "report_type": "alerts", "severity": "high"}
        self.assertEqual(self.client.post("/api/v1/reports/", payload, format="json").status_code, 403)
        self.client.force_authenticate(self.lead)
        saved = self.client.post("/api/v1/reports/", payload, format="json")
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertEqual(saved.data["metrics"]["analytics"]["totals"], {"alerts": 1})
        Alert.objects.filter(tenant=self.tenant).update(severity="low")
        result = self.client.get(f'/api/v1/reports/{saved.data["id"]}/')
        self.assertEqual(result.data["metrics"], saved.data["metrics"])

    def test_exports_and_permissions(self):
        url = "/api/v1/reports/export/"
        params = {**self.filters, "report_type": "alerts", "severity": "high"}
        response = self.client.get(url, {**params, "export": "csv"})
        self.assertEqual(response.status_code, 200)
        rows = list(csv.reader(io.StringIO(response.content.decode())))
        self.assertIn(["alerts", "1"], rows)
        self.assertNotIn(["Tenant", self.other.name], rows)
        response = self.client.get(url, {**params, "export": "pdf"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(b"".join(response.streaming_content).startswith(b"%PDF-"))
        self.assertEqual(self.client.get(url, {**params, "export": "csv", "tenant": self.other.pk}).status_code, 403)
        self.client.force_authenticate(self.platform)
        self.assertEqual(self.client.get(url, {**params, "export": "csv"}).status_code, 403)


    def test_detailed_records_search_sort_and_page(self):
        path = "/api/v1/reports/records/"
        overview = self.client.get(path, self.filters)
        self.assertEqual(overview.status_code, 200, overview.data)
        self.assertEqual(overview.data["count"], 2)
        self.assertEqual({row["record_type"] for row in overview.data["results"]}, {"alerts", "incidents"})
        start = (timezone.localdate() - timedelta(days=3)).isoformat()
        scoped = {**self.filters, "period_start": start}
        event = self.client.get(path, {**scoped, "report_type": "events", "search": "report fixture", "severity": "high"})
        self.assertEqual(event.data["count"], 1)
        self.assertEqual(event.data["results"][0]["record_context"], "fixture")
        self.assertEqual(event.data["results"][0]["record_severity"], "high")
        for number in range(26):
            Incident.objects.create(tenant=self.tenant, reference=f"PAGE-{number}", title=f"Page row {number:02}")
        query = {**self.filters, "report_type": "incidents", "search": "Page row", "ordering": "-record_title"}
        first = self.client.get(path, query).data
        second = self.client.get(path, {**query, "page": 2}).data
        self.assertEqual(first["count"], 26)
        self.assertEqual(len(first["results"]), 25)
        self.assertEqual(first["results"][0]["record_title"], "Page row 25")
        self.assertEqual(second["results"][0]["record_title"], "Page row 00")
        self.assertEqual(self.client.get(path, {**query, "tenant": self.other.pk}).status_code, 403)
        self.assertEqual(self.client.get(path, {**query, "ordering": "not_a_column"}).status_code, 400)

    def test_detailed_exports_use_same_filtered_search(self):
        path = "/api/v1/reports/records/export/"
        Alert.objects.filter(tenant=self.tenant).update(title="=Fictional formula")
        query = {**self.filters, "report_type": "alerts", "search": "formula", "status": "new", "severity": "high"}
        response = self.client.get(path, {**query, "export": "csv"})
        self.assertEqual(response.status_code, 200)
        rows = list(csv.reader(io.StringIO(b"".join(response.streaming_content).decode())))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1][3], "'=Fictional formula")
        pdf = self.client.get(path, {**query, "export": "pdf"})
        self.assertEqual(pdf.status_code, 200)
        defaults = self.client.get(path, {**self.filters, "export": "pdf"})
        self.assertEqual(defaults.status_code, 200)
        self.assertTrue(b"".join(defaults.streaming_content).startswith(b"%PDF-"))
        self.assertTrue(b"".join(pdf.streaming_content).startswith(b"%PDF-"))
        self.assertEqual(self.client.get(path, {**query, "export": "pdf", "tenant": self.other.pk}).status_code, 403)
        self.client.force_authenticate(self.platform)
        self.assertEqual(self.client.get(path, {**query, "export": "csv"}).status_code, 403)
