from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from apps.core.models import Tenant, User
from apps.incidents.models import Incident, TimelineEntry, Action, Playbook, PlaybookStep


class IncidentLifecycleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name="Horizon Bank", code="HORIZON", status="active")
        self.analyst = User.objects.create_user(
            email="analyst@horizonbank.com",
            password="Password@123!",
            full_name="Sarah Analyst",
            role="soc_analyst",
            tenant=self.tenant,
        )
        self.lead = User.objects.create_user(
            email="lead@horizonbank.com",
            password="Password@123!",
            full_name="Marcus Lead",
            role="soc_lead",
            tenant=self.tenant,
        )
        self.incident = Incident.objects.create(
            tenant=self.tenant,
            reference="INC-TEST-001",
            title="Lateral Movement Detected",
            severity="high",
            status="open",
            owner=self.lead,
            creator=self.analyst,
        )

    def test_incident_transition_lifecycle(self):
        self.client.force_authenticate(user=self.lead)

        # open -> investigating
        res1 = self.client.post(f"/api/v1/incidents/{self.incident.id}/transition/", {"status": "investigating"})
        self.assertEqual(res1.status_code, 200)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, "investigating")

        # investigating -> containment
        res2 = self.client.post(f"/api/v1/incidents/{self.incident.id}/transition/", {"status": "containment"})
        self.assertEqual(res2.status_code, 200)
        self.incident.refresh_from_db()
        self.assertEqual(self.incident.status, "containment")

    def test_incident_timeline_notes(self):
        self.client.force_authenticate(user=self.analyst)
        res = self.client.post(f"/api/v1/incidents/{self.incident.id}/timeline/", {
            "message": "Isolated external network adapter on host.",
            "entry_type": "note",
        })
        self.assertEqual(res.status_code, 201)
        self.assertGreaterEqual(TimelineEntry.objects.filter(incident=self.incident).count(), 2)

    def test_containment_action_task(self):
        self.client.force_authenticate(user=self.analyst)
        task = Action.objects.create(
            tenant=self.tenant,
            incident=self.incident,
            title="Revoke Compromised Credentials",
            required=True,
            status="pending",
        )
        res = self.client.post(f"/api/v1/incidents/{self.incident.id}/actions/{task.id}/transition/", {
            "status": "completed",
            "completion_notes": "All API tokens invalidated.",
        })
        self.assertEqual(res.status_code, 200)
        task.refresh_from_db()
        self.assertEqual(task.status, "completed")
