from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from collector import collect_channel, endpoint, normalize

RECORD = {
    "computer": "LAB-WS",
    "channel": "System",
    "provider": "Synthetic Provider",
    "event_id": 42,
    "record_id": 107,
    "level": 2,
    "occurred_at": "2026-11-25T09:30:00.0000000Z",
    "message": "Synthetic test event",
}


class CollectorTests(unittest.TestCase):
    def test_normalizes_and_uses_stable_identity(self):
        first = normalize(RECORD, "System")
        self.assertEqual(first["event_type"], "windows.system.42")
        self.assertEqual(first["occurred_at"], "2026-11-25T09:30:00+00:00")
        self.assertEqual(first["severity"], "high")
        self.assertEqual(first["metadata"]["record_id"], 107)
        self.assertEqual(first["external_event_id"], normalize(dict(RECORD), "System")["external_event_id"])
        later = {**RECORD, "occurred_at": "2026-11-26T09:30:00.0000000Z"}
        self.assertNotEqual(first["external_event_id"], normalize(later, "System")["external_event_id"])
        application = normalize({**RECORD, "channel": "Application"}, "Application")
        self.assertNotEqual(first["external_event_id"], application["external_event_id"])
        self.assertIn("message unavailable", normalize({**RECORD, "message": None}, "System")["message"])

    def test_preserves_standard_custom_and_missing_levels(self):
        expected = {0: "info", 1: "critical", 2: "high", 3: "medium",
                    4: "info", 5: "low", 16: "info", None: "info"}
        for level, severity in expected.items():
            with self.subTest(level=level):
                event = normalize({**RECORD, "level": level}, "System")
                self.assertEqual(event["severity"], severity)
                self.assertEqual(event["metadata"]["level"], level)
        missing = {key: value for key, value in RECORD.items() if key != "level"}
        self.assertIsNone(normalize(missing, "System")["metadata"]["level"])

    def test_rejects_other_channels_and_unsafe_api_origins(self):
        with self.assertRaises(ValueError):
            normalize({**RECORD, "channel": "Security"}, "System")
        with self.assertRaises(ValueError):
            normalize({**RECORD, "channel": "Application"}, "System")
        for url in ("http://example.org", "https://user:pass@example.org", "https://example.org/api", "file:///tmp"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                endpoint(url)
        self.assertEqual(endpoint("http://127.0.0.1:8000"), "http://127.0.0.1:8000/api/v1/ingest/events/")

    def test_failed_delivery_does_not_advance_cursor(self):
        records = [RECORD, {**RECORD, "record_id": 108}]
        seen = []
        state = {"channels": {}}

        def read(name, checkpoint, limit, backfill):
            minimum = checkpoint["id"] if checkpoint else 0
            return {"rows": [row for row in records if row["record_id"] > minimum],
                    "reset": False, "cursor": minimum, "anchor": None}

        def failing_send(payload):
            if payload["metadata"]["record_id"] == 108:
                raise RuntimeError("Temporarily unavailable.")
            seen.append(payload["metadata"]["record_id"])
            return "created"

        with TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            collect_channel("System", state, path, read, failing_send, 50, 0)
            channel = state["channels"]["System"]
            self.assertEqual(channel["status"], "error")
            self.assertEqual(channel["checkpoint"]["id"], 107)

            def accepted_duplicate(payload):
                seen.append(payload["metadata"]["record_id"])
                return "duplicate"

            collect_channel("System", state, path, read, accepted_duplicate, 50, 0)
            self.assertEqual(channel["checkpoint"]["id"], 108)
            self.assertEqual(channel["status"], "connected")
            self.assertTrue(channel["last_success_at"])
            self.assertEqual(seen, [107, 108])


if __name__ == "__main__":
    unittest.main()
