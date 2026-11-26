from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import PlatformWorkItem, SupportSession, Tenant, User
from apps.incidents.models import AuditLog


class PlatformAdministrationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user("platform@test.invalid", "FictionalAdmin123!", role="platform_admin")
        cls.other_admin = User.objects.create_user("platform2@test.invalid", role="platform_admin")
        cls.tenant = Tenant.objects.create(name="Example One", code="ADMIN1")
        cls.other = Tenant.objects.create(name="Example Two", code="ADMIN2")
        cls.customer = User.objects.create_user("customer@test.invalid", "FictionalCustomer123!", role="customer_admin", tenant=cls.tenant)
        cls.outside = User.objects.create_user("outside@test.invalid", role="soc_analyst", tenant=cls.other)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_overview_links_match_database_and_tenant_access_is_denied(self):
        overview = self.client.get("/api/v1/platform/")
        self.assertEqual(overview.status_code, 200)
        for resource, count in overview.data["counts"].items():
            self.assertEqual(self.client.get(f"/api/v1/platform/{resource}/").data["count"], count)
        self.assertEqual(self.client.get("/api/v1/platform/health/").data["database"], "connected")
        self.assertEqual(self.client.get("/api/v1/platform/reports/").status_code, 200)
        self.assertTrue(AuditLog.objects.filter(actor=self.admin, action="platform.report_generated").exists())
        self.assertEqual(self.client.get("/api/v1/events/").status_code, 403)
        self.client.force_authenticate(self.customer)
        for path in ("", "settings/", "users/", "work/backup/", "support/"):
            self.assertEqual(self.client.get("/api/v1/platform/" + path).status_code, 403)

    def test_status_confirmation_and_audit(self):
        path = f"/api/v1/platform/access/users/{self.customer.pk}/"
        self.assertEqual(self.client.post(path, {"state": "suspended", "confirm": False}).status_code, 400)
        self.assertEqual(self.client.post(path, {"state": "suspended", "confirm": True}).status_code, 200)
        self.customer.refresh_from_db()
        self.assertFalse(self.customer.is_active)
        self.assertTrue(self.customer.suspended)
        self.assertEqual(self.client.patch(f"/api/v1/users/{self.customer.pk}/", {"is_active": True}).status_code, 400)
        self.assertEqual(self.client.post(path, {"state": "active", "confirm": True}).status_code, 200)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.is_active)
        self.assertFalse(self.customer.suspended)
        tenant = f"/api/v1/platform/access/tenants/{self.tenant.pk}/"
        self.assertEqual(self.client.post(tenant, {"state": "inactive", "confirm": True}).status_code, 200)
        real_client = APIClient()
        self.assertFalse(real_client.login(email=self.admin.email, password="incorrect"))
        response = real_client.post("/api/v1/auth/login/", {"email": self.customer.email, "password": "FictionalCustomer123!"})
        self.assertEqual(response.status_code, 401)
        self.assertTrue(AuditLog.objects.filter(action="auth.login_failed", actor__isnull=True).exists())
        self.assertTrue(AuditLog.objects.filter(actor=self.admin, action="platform.tenants_access_changed", tenant=self.tenant).exists())

    def test_support_notice_actor_scope_expiry_and_end(self):
        url = "/api/v1/platform/support/"
        start = {"tenant": self.tenant.pk, "target": self.customer.pk, "reason": "Investigate an account issue"}
        self.assertEqual(self.client.post(url, {**start, "target": self.outside.pk}).status_code, 404)
        self.assertEqual(self.client.post(url, {**start, "reason": "short"}).status_code, 400)
        started = self.client.post(url, start)
        self.assertEqual(started.status_code, 201)
        session = SupportSession.objects.get(pk=started.data["id"])
        preview = self.client.get(url)
        self.assertEqual(preview.data["target"]["role"], "customer_admin")
        records = self.client.get(url, {"section": "users"}).data["records"]
        self.assertEqual([row["id"] for row in records["results"]], [self.customer.pk])
        self.assertEqual(self.client.get(url, {"section": "rules"}).status_code, 403)
        self.assertEqual(self.client.get("/api/v1/auth/me/").data["id"], self.admin.pk)
        other = APIClient()
        other.force_authenticate(self.customer)
        self.assertTrue(other.get("/api/v1/platform/notice/").data["support_active"])
        other.force_authenticate(self.outside)
        self.assertFalse(other.get("/api/v1/platform/notice/").data["support_active"])
        self.client.force_authenticate(self.other_admin)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertEqual(self.client.get(url).status_code, 404)
        next_session = self.client.post(url, start)
        SupportSession.objects.filter(pk=next_session.data["id"]).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.client.get(url).status_code, 404)
        for action in ("started", "viewed", "ended"):
            self.assertTrue(AuditLog.objects.filter(action=f"platform.support_{action}", actor=self.admin, tenant=self.tenant).exists())

    def test_configuration_and_work_items(self):
        settings = "/api/v1/platform/settings/"
        self.assertEqual(self.client.put(settings, {"support_minutes": 60}).status_code, 400)
        self.assertEqual(self.client.put(settings, {"support_minutes": 10, "maintenance_notice": "Scheduled verification"}).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/platform/notice/").data["maintenance"], "Scheduled verification")
        for kind in ("ticket", "maintenance", "backup", "detection", "integration"):
            payload = {"title": f"Demo {kind}", "details": "Fictional verification."}
            if kind == "detection":
                payload["configuration"] = {"event_type": "fixture", "conditions": {"severity": "high"}, "severity": "high"}
            created = self.client.post(f"/api/v1/platform/work/{kind}/", payload, format="json")
            self.assertEqual(created.status_code, 201, created.data)
            record = f'/api/v1/platform/work/{kind}/{created.data["id"]}/'
            self.assertEqual(self.client.get(record).status_code, 200)
            self.assertEqual(self.client.patch(record, {"status": "completed"}).status_code, 400)
            self.assertEqual(self.client.patch(record, {"status": "completed", "confirm": True}).status_code, 200)
            self.assertEqual(self.client.get(f"/api/v1/platform/work/{kind}/").data["count"], 1)
        self.assertEqual(PlatformWorkItem.objects.filter(status="completed").count(), 5)
        self.assertTrue(AuditLog.objects.filter(action="platform.work_updated", actor=self.admin).exists())

    def test_user_center_filters_and_history(self):
        counts = self.client.get("/api/v1/platform/user-counts/").data
        self.assertEqual(counts, {"all": 4, "active": 4, "inactive": 0, "disabled": 0})
        path = f"/api/v1/platform/access/users/{self.customer.pk}/"
        self.client.post(path, {"state": "suspended", "confirm": True})
        self.client.post(f"/api/v1/platform/access/users/{self.outside.pk}/", {"state": "inactive", "confirm": True})
        base = "/api/v1/users/"
        for state, expected in (("disabled", self.customer), ("inactive", self.outside)):
            rows = self.client.get(base, {"account_status": state}).data["results"]
            self.assertEqual([row["id"] for row in rows], [expected.pk])
            self.assertIn("last_login", rows[0])
        filtered = self.client.get(base, {"search": "customer", "role": "customer_admin", "tenant": self.tenant.pk}).data
        self.assertEqual(filtered["count"], 1)
        self.assertEqual(self.client.get("/api/v1/platform/user-counts/").data["disabled"], 1)
        history = self.client.get(f"/api/v1/platform/users/{self.customer.pk}/activity/").data["results"]
        self.assertTrue(any(row["action"] == "platform.users_access_changed" for row in history))
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get("/api/v1/platform/user-counts/").status_code, 403)

    def test_real_session_support_workspace_uses_target_permissions_and_blocks_writes(self):
        from apps.monitoring.models import Asset

        visible = Asset.objects.create(tenant=self.tenant, name="Visible asset")
        hidden = Asset.objects.create(tenant=self.other, name="Other asset")
        client = APIClient()
        client.force_login(self.admin)
        original_login = self.customer.last_login
        response = client.post("/api/v1/platform/support/", {
            "tenant": self.tenant.pk, "target": self.customer.pk, "reason": "Verify the account workspace",
        })
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(client.get("/api/v1/platform/notice/").data["support_active"])
        header = {"HTTP_X_OMNIEDGE_SUPPORT": str(response.data["id"])}
        projected = client.get("/api/v1/auth/me/", **header)
        self.assertEqual(projected.data["id"], self.customer.pk)
        self.assertIn("no-store", projected["Cache-Control"])
        self.assertIn("X-OmniEdge-Support", projected["Vary"])
        self.assertEqual(client.get("/api/v1/auth/me/").data["id"], self.admin.pk)
        self.assertEqual(client.get(f"/api/v1/assets/{visible.pk}/", **header).status_code, 200)
        self.assertEqual(client.get(f"/api/v1/assets/{hidden.pk}/", **header).status_code, 404)
        self.assertEqual(client.get("/api/v1/rules/", **header).status_code, 403)
        self.assertEqual(client.get("/api/v1/tenants/", **header).status_code, 403)
        self.assertEqual(client.post("/api/v1/assets/", {"name": "Forbidden"}, **header).status_code, 403)
        other_browser = APIClient()
        other_browser.force_login(self.admin)
        self.assertEqual(other_browser.get("/api/v1/auth/me/", **header).status_code, 403)
        self.assertTrue(AuditLog.objects.filter(actor=self.admin, action="platform.support_workspace_read", tenant=self.tenant).exists())
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.last_login, original_login)
        self.assertEqual(client.delete("/api/v1/platform/support/").status_code, 204)
        self.assertEqual(client.get("/api/v1/auth/me/", **header).status_code, 403)
