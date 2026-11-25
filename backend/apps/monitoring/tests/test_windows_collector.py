from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Tenant, User
from apps.core.utils import hash_secret
from apps.monitoring.models import Alert, Asset, Event, LogSource, Rule


class WindowsCollectorIngestionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.horizon = Tenant.objects.create(name="Horizon", code="WIN-H")
        cls.atlas = Tenant.objects.create(name="Atlas", code="WIN-A")
        cls.atlas_user = User.objects.create(email="win-atlas@example.test", role="soc_lead", tenant=cls.atlas)
        cls.asset = Asset.objects.create(name="Windows test station", tenant=cls.horizon, hostname="lab-ws.example.test")
        cls.source = LogSource.objects.create(tenant=cls.horizon, asset=cls.asset, name="Windows",
                                              source_type="windows_event", secret_key=hash_secret("demo-windows"))
        cls.foreign_rule = Rule.objects.create(tenant=cls.atlas, name="Other tenant", event_type="windows.system.42", severity="high")
        cls.rule = Rule.objects.create(tenant=cls.horizon, name="System warning", event_type="windows.system.42",
                                       conditions={"metadata__provider": "Synthetic Provider"}, severity="high")
        cls.payload = {
            "external_event_id": "windows:test-system-107",
            "event_type": "windows.system.42",
            "message": "Synthetic collector test",
            "occurred_at": "2026-11-25T09:30:00Z",
            "severity": "medium",
            "metadata": {"computer": "LAB-WS", "provider": "Synthetic Provider", "channel": "System",
                         "event_id": 42, "level": 3, "record_id": 107},
        }

    def setUp(self):
        self.client = APIClient(HTTP_X_SOURCE_KEY="demo-windows", HTTP_X_EXPECTED_SOURCE_ID=str(self.source.pk))
        self.url = "/api/v1/ingest/events/"

    def test_ingest_and_retry_run_only_the_linked_tenant_rule(self):
        self.assertEqual(self.client.head(self.url).status_code, 204)
        self.assertFalse(Event.objects.exists())
        created = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        event = Event.objects.get()
        self.assertEqual((event.tenant, event.source, event.source.asset), (self.horizon, self.source, self.asset))
        self.assertEqual(event.occurred_at.isoformat(), "2026-11-25T09:30:00+00:00")
        self.assertEqual(event.metadata["computer"], "LAB-WS")
        self.assertEqual(Alert.objects.get(event=event).rule, self.rule)
        self.assertEqual(self.client.post(self.url, self.payload, format="json").data["deduplicated"], True)
        self.assertEqual(Event.objects.count(), 1)
        self.assertEqual(Alert.objects.count(), 1)
        self.source.refresh_from_db()
        self.assertIsNotNone(self.source.last_seen)

    def test_missing_levels_and_legacy_retry(self):
        legacy = {**self.payload, "severity": "info", "metadata": {**self.payload["metadata"], "level": 0}}
        self.assertEqual(self.client.post(self.url, legacy, format="json").status_code, 201)
        modern = {**legacy, "metadata": {**legacy["metadata"], "level": None}}
        replay = self.client.post(self.url, modern, format="json")
        self.assertEqual(replay.status_code, 200)
        self.assertTrue(replay.data["deduplicated"])
        self.assertEqual(Event.objects.count(), 1)
        self.assertEqual(Alert.objects.count(), 1)
        modern["external_event_id"] = "windows:missing-108"
        modern["metadata"]["record_id"] = 108
        self.assertEqual(self.client.post(self.url, modern, format="json").status_code, 201)
        self.assertIsNone(Event.objects.get(external_event_id=modern["external_event_id"]).metadata["level"])

    def test_rejects_wrong_source_foreign_session_and_unexpected_host_or_channel(self):
        self.assertEqual(self.client.head(self.url, HTTP_X_EXPECTED_SOURCE_ID="999").status_code, 403)
        self.assertEqual(self.client.head(self.url, HTTP_X_SOURCE_KEY="wrong").status_code, 401)
        self.assertEqual(self.client.post(self.url, self.payload, format="json", HTTP_X_EXPECTED_SOURCE_ID="999").status_code, 403)
        self.client.force_login(self.atlas_user)
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 403)
        self.client.logout()
        for overrides in ({"computer": "FOREIGN"}, {"computer": "lab-ws.other.test"}, {"channel": "Security"}):
            data = {**self.payload, "metadata": {**self.payload["metadata"], **overrides}}
            self.assertEqual(self.client.post(self.url, data, format="json").status_code, 400)
        LogSource.objects.filter(pk=self.source.pk).update(enabled=False)
        self.assertEqual(self.client.head(self.url).status_code, 401)
        self.assertFalse(Event.objects.exists())
