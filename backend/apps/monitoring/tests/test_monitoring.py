import hashlib
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from apps.core.models import Tenant, User
from apps.monitoring.models import Asset, LogSource, Event, Rule, Alert


class MonitoringWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name="Horizon Bank", code="HORIZON", status="active")
        self.analyst = User.objects.create_user(
            email="analyst@horizonbank.com",
            password="Password@123!",
            full_name="Analyst Sarah",
            role="soc_analyst",
            tenant=self.tenant,
        )
        self.lead = User.objects.create_user(
            email="lead@horizonbank.com",
            password="Password@123!",
            full_name="Lead Marcus",
            role="soc_lead",
            tenant=self.tenant,
        )
        self.asset = Asset.objects.create(
            tenant=self.tenant,
            name="Core Banking Server",
            hostname="srv-core-01",
            ip_address="10.10.1.15",
            criticality="critical",
        )
        raw_key = "hrz_live_sec_key_12345"
        self.source = LogSource.objects.create(
            tenant=self.tenant,
            asset=self.asset,
            name="Horizon Syslog",
            source_type="syslog",
            secret_key=hashlib.sha256(raw_key.encode()).hexdigest(),
            secret_prefix=raw_key[:8],
            enabled=True,
        )
        self.rule = Rule.objects.create(
            tenant=self.tenant,
            name="Brute Force Detection",
            event_type="login_failed",
            conditions={"severity": "high"},
            severity="high",
            enabled=True,
        )

    def test_benign_event_does_not_trigger_alert(self):
        self.client.force_authenticate(user=self.analyst)
        event = Event.objects.create(
            tenant=self.tenant,
            source=self.source,
            external_event_id="EVT-001",
            event_type="login_success",
            severity="info",
            message="User logged in normally",
            occurred_at=timezone.now(),
        )
        # Verify no alerts created
        self.assertEqual(Alert.objects.filter(event=event).count(), 0)

    def test_matching_event_creates_alert_automatically(self):
        self.client.force_authenticate(user=self.analyst)
        # Simulate ingestion through simulator
        res = self.client.post("/api/v1/simulator/generate/", {
            "batch_size": 2,
            "event_type": "login_failed",
            "severity": "high",
        })
        self.assertIn(res.status_code, [200, 201])
        # Verify alert queue has alerts
        alerts = Alert.objects.filter(tenant=self.tenant)
        self.assertGreaterEqual(alerts.count(), 1)
        alert = alerts.first()
        self.assertEqual(alert.status, "new")

    def test_analyst_can_claim_and_triage_alert(self):
        self.client.force_authenticate(user=self.analyst)
        event = Event.objects.create(
            tenant=self.tenant,
            source=self.source,
            external_event_id="EVT-002",
            event_type="login_failed",
            severity="high",
            message="Brute force attempts",
            occurred_at=timezone.now(),
        )
        alert = Alert.objects.create(
            tenant=self.tenant,
            event=event,
            rule=self.rule,
            title="Brute force test alert",
            severity="high",
            status="new",
        )

        # Claim
        claim_res = self.client.post(f"/api/v1/alerts/{alert.id}/claim/")
        self.assertEqual(claim_res.status_code, 200)
        alert.refresh_from_db()
        self.assertEqual(alert.status, "in_review")
        self.assertEqual(alert.assignee, self.analyst)

        # Triage
        triage_res = self.client.post(f"/api/v1/alerts/{alert.id}/triage/", {
            "severity": "critical",
            "triage_notes": "Confirmed malicious source IP",
        })
        self.assertEqual(triage_res.status_code, 200)
        alert.refresh_from_db()
        self.assertEqual(alert.severity, "critical")
