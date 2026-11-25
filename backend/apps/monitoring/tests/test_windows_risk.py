from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import Tenant, User
from apps.monitoring.models import Alert, Event, LogSource, Rule


class WindowsRiskTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(code="WIN-RISK", name="Risk fixture")
        self.source = LogSource.objects.create(tenant=self.tenant, name="Synthetic Windows fixture")
        self.user = User.objects.create(tenant=self.tenant, email="fixture@example.test", role="soc_analyst")
        self.actor = APIClient()
        self.actor.force_authenticate(self.user)
        for _ in range(2):
            call_command("install_windows_rules", tenant_id=self.tenant.pk, stdout=StringIO())
        self.assertEqual(Rule.objects.filter(tenant=self.tenant).count(), 4)

    def event(self, event_type, channel, provider, event_id, level, severity):
        return Event.objects.create(
            tenant=self.tenant, source=self.source, event_type=event_type, severity=severity,
            occurred_at=timezone.now(), message="[SYNTHETIC TEST] Windows risk fixture",
            metadata={"synthetic": True, "channel": channel, "provider": provider,
                      "event_id": event_id, "level": level},
        )

    def test_rule_risk_and_original_level_are_independent(self):
        cases = (
            ("application", 1002, "Application Hang", 2, "high", "low"),
            ("security", 4625, "Microsoft-Windows-Security-Auditing", 0, "info", "medium"),
            ("system", 98, "Microsoft-Windows-Ntfs", 2, "high", "high"),
            ("system", 55, "Ntfs", 2, "high", "critical"),
            ("application", 1002, "Unrelated Provider", 4, "info", None),
        )
        for channel, event_id, provider, level, severity, risk in cases:
            with self.subTest(provider=provider, event_id=event_id):
                event = self.event(f"windows.{channel}.{event_id}", channel.title(), provider, event_id, level, severity)
                response = self.actor.get(f"/api/v1/events/{event.id}/")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data["metadata"]["level"], level)
                self.assertEqual(response.data["severity"], severity)
                self.assertEqual(response.data["risk_severity"], risk or "low")
                self.assertEqual(list(Alert.objects.filter(event=event).values_list("severity", flat=True)),
                                 [risk] if risk else [])

    def test_highest_non_dismissed_alert_controls_table_risk(self):
        event_type = "windows.security.4625"
        Rule.objects.create(tenant=self.tenant, name="Additional review rule", event_type=event_type, severity="high")
        event = self.event(event_type, "Security", "Microsoft-Windows-Security-Auditing", 4625, 0, "info")
        self.assertEqual(self.actor.get("/api/v1/events/").data["results"][0]["risk_severity"], "high")
        self.assertEqual(self.actor.get("/api/v1/events/?risk=high").data["count"], 1)
        self.assertEqual(self.actor.get("/api/v1/events/?risk=none").data["count"], 0)
        Alert.objects.filter(event=event, severity="high").update(status="dismissed")
        self.assertEqual(self.actor.get(f"/api/v1/events/{event.id}/").data["risk_severity"], "medium")
