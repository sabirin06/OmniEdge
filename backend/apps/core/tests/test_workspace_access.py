from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import Tenant, User
from apps.incidents.models import Report
from apps.monitoring.models import Asset, Event, LogSource


class WorkspaceAccessTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.horizon = Tenant.objects.create(name="Horizon", code="ACCESS-H")
        cls.atlas = Tenant.objects.create(name="Atlas", code="ACCESS-A")
        cls.platform = User.objects.create(email="platform-access@example.test", role="platform_admin")
        cls.customer = User.objects.create(email="customer-access@example.test", role="customer_admin", tenant=cls.horizon)
        cls.lead = User.objects.create(email="lead-access@example.test", role="soc_lead", tenant=cls.horizon)
        cls.analyst = User.objects.create(email="analyst-access@example.test", role="soc_analyst", tenant=cls.horizon)
        cls.foreign = User.objects.create(email="foreign-access@example.test", role="customer_admin", tenant=cls.atlas)
        for tenant in (cls.horizon, cls.atlas):
            asset = Asset.objects.create(name="Asset", tenant=tenant)
            source = LogSource.objects.create(name="Source", tenant=tenant, asset=asset)
            Event.objects.create(tenant=tenant, source=source, event_type="fixture", message="Test data", occurred_at=timezone.now())
            Report.objects.create(tenant=tenant, title="Snapshot", period_start=timezone.localdate(), period_end=timezone.localdate())

    def setUp(self):
        self.client = APIClient()

    def login(self, user):
        self.client.force_authenticate(user)

    def test_profile_persists_without_allowing_access_changes(self):
        self.login(self.analyst)
        response = self.client.patch("/api/v1/auth/me/", {
            "full_name": "Analyst", "theme": "light", "dashboard_refresh_seconds": 15,
            "role": "platform_admin", "is_active": False, "tenant": self.atlas.pk,
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        actual = self.client.get("/api/v1/auth/me/").data
        self.assertEqual((actual["theme"], actual["dashboard_refresh_seconds"], actual["full_name"]), ("light", 15, "Analyst"))
        self.assertEqual((actual["role"], actual["is_active"], actual["tenant"]), ("soc_analyst", True, self.horizon.pk))
        invalid = self.client.patch("/api/v1/auth/me/", {"theme": "unknown"}, format="json")
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(invalid.data["field_codes"]["theme"], ["invalid_choice"])
        self.assertIn("theme", invalid.data["errors"])
        self.login(self.lead)
        self.assertEqual(self.client.get("/api/v1/auth/me/").data["theme"], "system")

    def test_platform_dashboard_excludes_tenant_telemetry(self):
        self.login(self.platform)
        result = self.client.get("/api/v1/dashboard/").data
        self.assertEqual(result["scope"], "platform")
        self.assertEqual(result["tenants"], 2)
        self.assertNotIn("recent_alerts", result)
        self.assertNotIn("events_24h", result)
        for path in ("events/", "alerts/", "assets/", "incidents/", "reports/", "playbooks/", "rules/", "log-sources/"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get("/api/v1/" + path).status_code, 403)

    def test_tenant_dashboard_and_reports_are_scoped(self):
        self.login(self.analyst)
        result = self.client.get("/api/v1/dashboard/").data
        self.assertEqual(result["scope"], "tenant")
        self.assertEqual(result["events_24h"], 1)
        self.assertEqual(sum(day["events"] for day in result["activity"]), 1)
        self.assertEqual(self.client.get("/api/v1/reports/").data["count"], 1)
        foreign_report = Report.objects.get(tenant=self.atlas)
        self.assertEqual(self.client.get(f"/api/v1/reports/{foreign_report.pk}/").status_code, 404)
        self.assertEqual(self.client.post("/api/v1/reports/", {}).status_code, 403)

    def test_report_uses_database_counts_and_excludes_manual_detection_timing(self):
        from datetime import timedelta
        from apps.monitoring.models import Alert, Rule

        event = Event.objects.get(tenant=self.horizon)
        rule = Rule.objects.create(tenant=self.horizon, name="Timing fixture", severity="high")
        automatic = Alert.objects.create(tenant=self.horizon, event=event, rule=rule, severity="high", title="Detected")
        manual = Alert.objects.create(tenant=self.horizon, event=event, rule=rule, severity="low",
                                      title="Reviewed", rule_snapshot={"origin": "manual_review"})
        Alert.objects.filter(pk=automatic.pk).update(created_at=event.received_at + timedelta(minutes=2))
        Alert.objects.filter(pk=manual.pk).update(created_at=event.received_at + timedelta(hours=1))

        self.login(self.customer)
        today = timezone.localdate().isoformat()
        response = self.client.post("/api/v1/reports/", {
            "title": "Calculated snapshot", "period_start": today,
            "period_end": (timezone.localdate() + timedelta(days=1)).isoformat(),
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        metrics = response.data["metrics"]
        self.assertEqual(metrics["events"]["total"], 1)
        self.assertEqual(metrics["alerts"]["total"], 2)
        self.assertEqual(metrics["alerts"]["by_severity"]["high"], 1)
        self.assertEqual(metrics["mean_time_to_detect_minutes"], 2.0)

    def test_api_permissions_match_management_roles(self):
        self.login(self.analyst)
        for path in ("rules/", "playbooks/", "log-sources/", "tenants/", "audit-logs/"):
            self.assertEqual(self.client.get("/api/v1/" + path).status_code, 403)
        directory = self.client.get("/api/v1/users/").data["results"]
        self.assertEqual({row["id"] for row in directory}, {self.customer.pk, self.lead.pk, self.analyst.pk})
        self.assertNotIn("email", directory[0])
        self.assertEqual(self.client.get("/api/v1/users/", {"search": self.customer.email}).data["count"], 0)
        self.assertEqual(self.client.get(f"/api/v1/users/{self.customer.pk}/").status_code, 403)
        self.login(self.customer)
        self.assertEqual(self.client.get("/api/v1/rules/").status_code, 403)
        self.assertEqual(self.client.get(f"/api/v1/users/{self.foreign.pk}/").status_code, 404)
        self.login(self.lead)
        self.assertEqual(self.client.get("/api/v1/log-sources/").status_code, 200)
        self.assertEqual(self.client.post("/api/v1/log-sources/", {}).status_code, 403)
