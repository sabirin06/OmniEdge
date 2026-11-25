from concurrent.futures import ThreadPoolExecutor
from tempfile import TemporaryDirectory
from threading import Barrier

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connections
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import Tenant, User
from apps.incidents.models import Incident
from apps.monitoring.models import Alert, Asset, LogSource, Rule, Event


class DayTwoWorkflowTests(TestCase):
    client_class = APIClient
    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name="Horizon", code="HZN")
        other = Tenant.objects.create(name="Atlas", code="ATLAS")
        cls.analyst = User.objects.create(email="analyst@example.test", role="soc_analyst", tenant=cls.tenant)
        cls.lead = User.objects.create(email="lead@example.test", role="soc_lead", tenant=cls.tenant)
        cls.admin = User.objects.create(email="customer@example.test", role="customer_admin", tenant=cls.tenant)
        cls.outsider = User.objects.create(email="atlas@example.test", role="soc_lead", tenant=other)
        asset = Asset.objects.create(name="Synthetic server", tenant=cls.tenant)
        cls.source = LogSource.objects.create(name="Demo source", tenant=cls.tenant, asset=asset)
        Rule.objects.create(name="Test detection", tenant=cls.tenant, event_type="login_failed", severity="high")

    def request(self, method, path, code, payload=None, format="json"):
        response = getattr(self.client, method)("/api/v1/" + path, payload, format=format)
        self.assertEqual(response.status_code, code, getattr(response, "data", None))
        return response

    def authenticate(self, user):
        self.client.force_authenticate(user)

    def test_full_workflow_and_snapshot(self):
        self.authenticate(self.analyst)
        self.request("post", "simulator/generate/", 201, {"count": 2, "source_id": self.source.pk, "event_type": "login_failed"})
        alert, dismissed = Alert.objects.order_by("id")
        alerts = f"alerts/{alert.pk}/"
        self.request("post", f"alerts/{dismissed.pk}/dismiss/", 400, {"reason": ""})
        self.request("post", f"alerts/{dismissed.pk}/dismiss/", 200, {"reason": "Expected demo."})
        self.authenticate(self.analyst)
        self.request("post", alerts + "claim/", 200)
        triage = self.request("post", alerts + "triage/", 200, {"severity": "critical", "notes": "Fictional triage."}).data
        self.assertEqual((triage["severity"], triage["triage_notes"]), ("critical", "Fictional triage."))
        incident = self.request("post", alerts + "escalate/", 201, {
            "title": "Synthetic case", "severity": "high", "description": "Initial findings from the intake form.",
        }).data
        self.assertEqual(incident["severity"], "high")
        self.assertEqual(incident["description"], "Initial findings from the intake form.")
        self.assertEqual(incident["owner"], self.analyst.pk)
        self.assertEqual(self.request("get", alerts, 200).data["incident"], incident["id"])
        self.request("post", alerts + "escalate/", 400, {})
        standalone = self.request("post", "incidents/", 201, {"title": "Standalone case"}).data
        self.request("get", f"incidents/{standalone['id']}/", 200)
        case = f"incidents/{incident['id']}/"
        self.request("patch", case, 400, {"owner": self.outsider.pk})
        self.request("post", case + "transition/", 200, {"status": "investigating"})
        self.request("post", case + "timeline/", 201, {"message": "Reviewed synthetic evidence."})
        self.authenticate(self.lead)
        playbook = self.request("post", "playbooks/", 201, {"name": "Synthetic response"}).data
        self.request("post", f"playbooks/{playbook['id']}/steps/", 201, {
            "position": 1, "title": "Review demo activity", "instructions": "Document synthetic findings", "required": True,
        })
        applied = self.request("post", case + "apply-playbook/", 200, {
            "playbook_id": playbook["id"], "assignee": self.analyst.pk,
        }).data
        self.assertEqual(applied["actions_created"], 1)
        self.assertEqual(self.request("post", case + "apply-playbook/", 200, {"playbook_id": playbook["id"]}).data["actions_created"], 0)
        task = case + f"actions/{applied['action_ids'][0]}/transition/"
        self.request("post", case + "transition/", 200, {"status": "containment"})
        self.request("post", case + "transition/", 400, {"status": "resolved", "resolution_summary": "Done"})
        self.authenticate(self.analyst)
        self.request("post", task, 200, {"status": "in_progress"})
        self.request("post", task, 400, {"status": "completed"})
        self.request("post", task, 200, {"status": "completed", "completion_notes": "Verified fictional activity."})
        self.request("post", case + "transition/", 200, {"status": "resolved", "resolution_summary": "Demo response complete."})
        self.request("post", case + "transition/", 403, {"status": "closed"})
        self.authenticate(self.admin)
        self.request("post", case + "transition/", 403, {"status": "closed"})
        self.authenticate(self.lead)
        today = timezone.localdate().isoformat()
        payload = {"title": "Before closure", "period_start": today, "period_end": today}
        snapshot = self.request("post", "reports/", 201, payload).data
        self.request("post", case + "transition/", 200, {"status": "closed"})
        self.assertEqual(self.request("get", alerts, 200).data["status"], "resolved")
        closed = self.request("get", case, 200).data
        self.assertEqual(closed["closed_by"], self.lead.pk)
        history = self.request("get", case + "timeline/", 200).data["results"]
        self.assertTrue(any(entry["entry_type"] == "note" and entry["actor"] == self.analyst.pk for entry in history))
        self.assertTrue(any(entry["metadata"].get("new_status") == "closed" for entry in history))
        self.assertEqual(self.request("get", "dashboard/", 200).data["open_tasks"], 0)
        latest = self.request("post", "reports/", 201, {**payload, "title": "After closure"}).data
        self.assertEqual(latest["metrics"]["events"]["total"], 2)
        self.assertEqual(latest["metrics"]["incidents"]["by_status"]["closed"], 1)
        self.assertEqual(latest["metrics"]["open_workload"]["alerts"], 0)
        self.assertEqual(self.request("get", f"reports/{snapshot['id']}/", 200).data["metrics"], snapshot["metrics"])
        self.assertGreater(self.request("get", "audit-logs/?search=report.generated", 200).data["count"], 0)
        self.authenticate(self.outsider)
        self.request("get", case, 404)
        self.request("get", f"reports/{latest['id']}/", 404)

    def test_evidence_access_validation_and_privacy(self):
        self.authenticate(self.analyst)
        incident = self.request("post", "incidents/", 201, {"title": "Private evidence demo"}).data
        case = f"incidents/{incident['id']}/evidence/"
        def file(name, data, content_type):
            return {"file": SimpleUploadedFile(name, data, content_type=content_type)}
        with TemporaryDirectory() as root, self.settings(EVIDENCE_ROOT=root):
            self.request("post", case, 400, file("bad.pdf", b"not a PDF", "application/pdf"), "multipart")
            self.request("post", case, 400, file("big.txt", b"a" * (5 * 1024 * 1024 + 1), "text/plain"), "multipart")
            data = b"Fictional investigative note."
            saved = self.request("post", case, 201, file("sample.txt", data, "text/plain"), "multipart").data
            self.assertNotIn("stored_path", saved)
            path = case + f"{saved['id']}/download/"
            response = self.request("get", path, 200)
            self.assertEqual(b"".join(response.streaming_content), data)
            self.assertEqual(self.client.get("/media/evidence/sample.txt").status_code, 404)
            self.authenticate(self.outsider)
            self.request("get", path, 404)


class ConcurrentEscalationTests(TransactionTestCase):
    def test_two_requests_create_one_case(self):
        tenant = Tenant.objects.create(name="Horizon", code="RACE")
        actor = User.objects.create(email="race@example.test", tenant=tenant, role="soc_analyst")
        source = LogSource.objects.create(name="Demo", tenant=tenant)
        event = Event.objects.create(tenant=tenant, source=source, event_type="synthetic",
                                     message="Concurrent demo", occurred_at=timezone.now())
        rule = Rule.objects.create(tenant=tenant, name="Synthetic rule", event_type="synthetic", severity="high")
        alert = Alert.objects.create(tenant=tenant, event=event, rule=rule, title="Synthetic alert", severity="high")
        barrier = Barrier(2)

        def escalate():
            try:
                client = APIClient()
                client.force_authenticate(actor)
                barrier.wait(timeout=10)
                return client.post(f"/api/v1/alerts/{alert.pk}/escalate/", {}, format="json").status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(executor.map(lambda _: escalate(), range(2)))
        self.assertCountEqual(outcomes, [201, 400])
        self.assertEqual(Incident.objects.count(), 1)
        alert.refresh_from_db()
        self.assertEqual(alert.status, "escalated")
        self.assertIsNotNone(alert.incident_id)
