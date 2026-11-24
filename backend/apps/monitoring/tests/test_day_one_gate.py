from django.core.management import call_command
from django.test import TestCase
from io import StringIO
from rest_framework.test import APIClient

from apps.core.models import Tenant, User
from apps.core.utils import hash_secret
from apps.monitoring.models import Alert, Asset, Event, LogSource, Rule


class DayOneGateTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.horizon = Tenant.objects.create(name="Horizon", code="HORIZON")
        cls.atlas = Tenant.objects.create(name="Atlas", code="ATLAS")
        cls.admin = User.objects.create(email="platform@example.com", role="platform_admin")
        cls.horizon_admin = User.objects.create(email="horizon@example.com", role="customer_admin", tenant=cls.horizon)
        cls.atlas_admin = User.objects.create(email="atlas@example.com", role="customer_admin", tenant=cls.atlas)
        cls.analyst = User.objects.create(email="analyst@example.com", role="soc_analyst", tenant=cls.horizon)
        cls.asset = Asset.objects.create(name="Test server", tenant=cls.horizon)
        cls.source = LogSource.objects.create(
            tenant=cls.horizon, asset=cls.asset, name="Test collector", secret_key=hash_secret("fictional-key"),
        )
        cls.rule = Rule.objects.create(
            tenant=cls.horizon, name="Repeated sign-in failures", event_type="login_failed",
            conditions={"metadata__failed_attempts": {"gte": 5}}, severity="high",
        )

    def test_ingestion_matches_and_replay_is_idempotent(self):
        client = APIClient(HTTP_X_SOURCE_KEY="fictional-key")
        url = "/api/v1/ingest/events/"
        payload = {
            "external_event_id": "demo-1", "event_type": "login_failed",
            "message": "Synthetic login failures", "metadata": {"failed_attempts": 7},
            "occurred_at": "2026-11-24T08:00:00Z",
        }
        created = client.post(url, payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        event = Event.objects.get(pk=created.data["id"])
        self.assertEqual(event.occurred_at.isoformat(), "2026-11-24T08:00:00+00:00")
        self.assertEqual(Alert.objects.filter(event=event, rule=self.rule).count(), 1)
        replay = client.post(url, payload, format="json")
        self.assertEqual(replay.data, {"id": event.pk, "deduplicated": True})
        self.assertEqual(client.post(url, {**payload, "metadata": {}}, format="json").status_code, 409)
        self.assertEqual(Event.objects.filter(source=self.source).count(), 1)
        self.assertEqual(Alert.objects.count(), 1)
        self.assertEqual(client.post(url, {"event_type": "login_failed"}, format="json").status_code, 400)

        Rule.objects.filter(pk=self.rule.pk).update(enabled=False)
        self.assertEqual(client.post(url, {**payload, "external_event_id": "demo-2"}, format="json").status_code, 201)
        self.assertEqual(Alert.objects.count(), 1)
        LogSource.objects.filter(pk=self.source.pk).update(enabled=False)
        self.assertEqual(client.post(url, {**payload, "external_event_id": "demo-3"}, format="json").status_code, 401)

    def test_tenant_scope_admin_writes_and_simulator(self):
        client = APIClient()
        client.force_authenticate(self.atlas_admin)
        self.assertEqual(client.get("/api/v1/events/").data["count"], 0)
        self.assertEqual(client.get("/api/v1/log-sources/").data["count"], 0)
        self.assertEqual(client.get(f"/api/v1/assets/{self.asset.pk}/").status_code, 404)
        self.assertEqual(client.post("/api/v1/log-sources/", {"name": "Foreign link", "asset": self.asset.pk}).status_code, 400)
        self.assertEqual(client.post("/api/v1/simulator/generate/", {"source_id": self.source.pk}).status_code, 400)
        cross_tenant_session = APIClient(HTTP_X_SOURCE_KEY="fictional-key")
        cross_tenant_session.force_login(self.atlas_admin)
        self.assertEqual(cross_tenant_session.post("/api/v1/ingest/events/").status_code, 403)
        client.force_authenticate(self.analyst)
        self.assertEqual(client.post("/api/v1/assets/", {"name": "Unauthorized write"}).status_code, 403)

        client.force_authenticate(self.horizon_admin)
        response = client.post("/api/v1/simulator/generate/", {
            "source_id": self.source.pk, "batch_size": 2, "event_type": "login_failed", "severity": "critical",
        })
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["created"], 2)
        self.assertEqual(response.data["alerts_created"], 2)
        self.assertEqual(Event.objects.filter(source=self.source, severity="critical").count(), 2)
        self.source.refresh_from_db()
        self.assertIsNotNone(self.source.last_seen)

    def test_suspension_blocks_existing_sessions_and_source_keys(self):
        client = APIClient()
        client.force_login(self.horizon_admin)
        self.assertEqual(client.get("/api/v1/assets/").status_code, 200)
        admin = APIClient()
        admin.force_authenticate(self.admin)
        self.assertEqual(admin.post(f"/api/v1/tenants/{self.horizon.pk}/suspend/").status_code, 200)
        self.assertEqual(client.get("/api/v1/assets/").status_code, 403)
        self.assertEqual(client.post("/api/v1/auth/logout/").status_code, 200)
        ingest = APIClient(HTTP_X_SOURCE_KEY="fictional-key")
        self.assertEqual(ingest.post("/api/v1/ingest/events/").status_code, 401)


class FreshSeedTests(TestCase):
    def test_fresh_seed_and_csrf_sessions_for_all_roles(self):
        call_command("seed_demo", stdout=StringIO())
        roles = set(User.objects.values_list("role", flat=True))
        self.assertEqual(roles, {"platform_admin", "customer_admin", "soc_lead", "soc_analyst"})
        self.assertEqual(Tenant.objects.count(), 2)
        self.assertGreater(Event.objects.count(), 0)
        self.assertGreater(Alert.objects.count(), 0)

        accounts = [
            ("admin@omniteckno.com", "Admin@123!", "platform_admin"),
            ("admin@horizonbank.com", "Horizon@123!", "customer_admin"),
            ("lead.marcus@horizonbank.com", "Password@123!", "soc_lead"),
            ("analyst.sarah@horizonbank.com", "Password@123!", "soc_analyst"),
        ]
        for email, password, role in accounts:
            with self.subTest(role=role):
                client = APIClient(enforce_csrf_checks=True)
                payload = {"email": email, "password": password}
                self.assertEqual(client.post("/api/v1/auth/login/", payload).status_code, 403)
                token = client.get("/api/v1/auth/csrf/").data["csrfToken"]
                self.assertEqual(client.post("/api/v1/auth/login/", payload, HTTP_X_CSRFTOKEN=token).status_code, 200)
                self.assertEqual(client.get("/api/v1/auth/me/").data["role"], role)
                self.assertEqual(client.post(
                    "/api/v1/auth/logout/", HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
                ).status_code, 200)
