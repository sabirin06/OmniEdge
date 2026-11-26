"""
Management command to seed realistic demo data for OmniEdge:
- 2 tenants: Horizon Bank (HORIZON) and Atlas Finance (ATLAS)
- Users for all 4 roles
- Assets and Log Sources
- Detection Rules
- Events (normal and suspicious)
- Alerts with varied statuses (new, in_review, escalated, dismissed, resolved)
- Incidents with timeline entries, actions, and evidence
- Playbooks with steps
- Security Reports
"""
import hashlib
from datetime import timedelta
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.core.models import Tenant, User
from apps.core.utils import generate_secret_key
from apps.incidents.reporting import report_metrics
from apps.monitoring.models import Asset, LogSource, Event, Rule, Alert
from apps.incidents.models import Incident, TimelineEntry, Evidence, Playbook, PlaybookStep, Action, Report, AuditLog


class Command(BaseCommand):
    help = "Seed database with realistic multi-tenant demonstration data."

    def handle(self, *args, **options):
        self.stdout.write("Seeding OmniEdge demonstration data...")

        # 1. Tenants
        horizon, _ = Tenant.objects.get_or_create(
            code="HORIZON",
            defaults={
                "name": "Horizon Bank",
                "industry": "Financial Services",
                "contact_email": "security@horizonbank.com",
                "status": "active",
            },
        )
        atlas, _ = Tenant.objects.get_or_create(
            code="ATLAS",
            defaults={
                "name": "Atlas Finance",
                "industry": "FinTech / Payments",
                "contact_email": "soc@atlasfinance.com",
                "status": "active",
            },
        )
        self.stdout.write(f"  [+] Tenants ready: {horizon.name}, {atlas.name}")

        # 2. Users
        def create_or_update_user(email, password, full_name, role, tenant=None, is_staff=False):
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "full_name": full_name,
                    "role": role,
                    "tenant": tenant,
                    "is_staff": is_staff,
                },
            )
            user.set_password(password)
            user.full_name = full_name
            user.role = role
            user.tenant = tenant
            user.is_staff = is_staff
            user.save()
            return user

        # Platform Admin (Global)
        admin = create_or_update_user("admin@omniteckno.com", "Admin@123!", "OmniTeckno Admin", "platform_admin", None, True)
        
        # Horizon Bank users
        h_admin = create_or_update_user("admin@horizonbank.com", "Horizon@123!", "Sarah Connor (Admin)", "customer_admin", horizon)
        h_lead = create_or_update_user("lead.marcus@horizonbank.com", "Password@123!", "Marcus Vance (SOC Lead)", "soc_lead", horizon)
        h_analyst1 = create_or_update_user("analyst.sarah@horizonbank.com", "Password@123!", "Sarah Jenkins (SOC Analyst)", "soc_analyst", horizon)
        h_analyst2 = create_or_update_user("analyst.john@horizonbank.com", "Password@123!", "John Davis (SOC Analyst)", "soc_analyst", horizon)

        # Atlas Finance users
        a_admin = create_or_update_user("admin@atlasfinance.com", "Atlas@123!", "Elena Rostova (Admin)", "customer_admin", atlas)
        a_lead = create_or_update_user("lead.david@atlasfinance.com", "Password@123!", "David Kim (SOC Lead)", "soc_lead", atlas)
        a_analyst1 = create_or_update_user("analyst.emma@atlasfinance.com", "Password@123!", "Emma Watson (SOC Analyst)", "soc_analyst", atlas)

        self.stdout.write("  [+] Users ready for all roles across both tenants.")

        # 3. Assets
        h_assets = [
            ("Core Banking Server", "srv-core-01.horizon.internal", "10.10.1.15", "server", "critical"),
            ("SWIFT Gateway", "gw-swift-01.horizon.internal", "10.10.1.20", "network_device", "critical"),
            ("Primary DB Cluster", "db-prod-cluster.horizon.internal", "10.10.2.5", "database", "critical"),
            ("Customer Web Portal", "web-portal-01.horizon.internal", "10.10.3.10", "application", "high"),
            ("Corporate Firewall", "fw-edge-01.horizon.internal", "192.168.1.1", "network_device", "high"),
        ]
        h_asset_objs = []
        for name, hostname, ip, atype, crit in h_assets:
            a, _ = Asset.objects.get_or_create(
                tenant=horizon,
                name=name,
                defaults={"hostname": hostname, "ip_address": ip, "asset_type": atype, "criticality": crit, "status": "active"},
            )
            h_asset_objs.append(a)

        a_assets = [
            ("Payment Processing Engine", "pay-engine-01.atlas.internal", "172.16.1.10", "application", "critical"),
            ("PostgreSQL Ledger DB", "db-ledger-01.atlas.internal", "172.16.2.15", "database", "critical"),
            ("API Gateway", "apigw-01.atlas.internal", "172.16.3.1", "server", "high"),
        ]
        for name, hostname, ip, atype, crit in a_assets:
            Asset.objects.get_or_create(
                tenant=atlas,
                name=name,
                defaults={"hostname": hostname, "ip_address": ip, "asset_type": atype, "criticality": crit, "status": "active"},
            )

        self.stdout.write("  [+] Assets ready.")

        # 4. Log Sources
        def get_key_hash(raw_key):
            return hashlib.sha256(raw_key.encode()).hexdigest(), raw_key[:8]

        h_k1, h_p1 = get_key_hash(generate_secret_key())
        h_src1, _ = LogSource.objects.get_or_create(
            tenant=horizon,
            name="Horizon Syslog Collector",
            defaults={
                "asset": h_asset_objs[0],
                "source_type": "syslog",
                "secret_key": h_k1,
                "secret_prefix": h_p1,
                "enabled": True,
                "last_seen": timezone.now(),
            },
        )
        h_k2, h_p2 = get_key_hash(generate_secret_key())
        h_src2, _ = LogSource.objects.get_or_create(
            tenant=horizon,
            name="Horizon Web Application Firewall",
            defaults={
                "asset": h_asset_objs[3],
                "source_type": "json_http",
                "secret_key": h_k2,
                "secret_prefix": h_p2,
                "enabled": True,
                "last_seen": timezone.now(),
            },
        )
        self.stdout.write("  [+] Log Sources ready.")

        # 5. Detection Rules
        rule_brute, _ = Rule.objects.get_or_create(
            tenant=horizon,
            name="Brute Force Authentication Failure",
            defaults={
                "event_type": "login_failed",
                "conditions": {"severity": "high"},
                "severity": "high",
                "description": "Fires when multiple failed logins are recorded in quick succession.",
                "enabled": True,
            },
        )
        rule_priv, _ = Rule.objects.get_or_create(
            tenant=horizon,
            name="Suspicious Privilege Escalation",
            defaults={
                "event_type": "privilege_escalation",
                "conditions": {},
                "severity": "critical",
                "description": "Fires on any unexpected sudo or root privilege change.",
                "enabled": True,
            },
        )
        rule_egress, _ = Rule.objects.get_or_create(
            tenant=horizon,
            name="Anomalous Data Egress Spike",
            defaults={
                "event_type": "data_transfer",
                "conditions": {"severity": "high"},
                "severity": "medium",
                "description": "Detects high volume data transmission outbound to foreign ASN.",
                "enabled": True,
            },
        )
        Rule.objects.get_or_create(
            tenant=horizon,
            name="Legacy FTP Usage (Disabled)",
            defaults={
                "event_type": "ftp_connection",
                "conditions": {},
                "severity": "low",
                "description": "Audit rule for unencrypted FTP protocol usage.",
                "enabled": False,
            },
        )
        self.stdout.write("  [+] Detection Rules ready.")

        # 6. Events & Alerts
        now = timezone.now()
        events_data = [
            ("EVT-1001", "login_success", "info", "User m.vance logged into core server via SSH", "192.168.1.100", now - timedelta(hours=5), {"user": "m.vance", "method": "pubkey"}),
            ("EVT-1002", "login_failed", "high", "7 failed root attempts on srv-core-01", "198.51.100.45", now - timedelta(hours=4), {"failed_attempts": 7, "target": "root"}),
            ("EVT-1003", "privilege_escalation", "critical", "Unauthorized sudo /bin/bash execution by service_acc", "10.10.1.15", now - timedelta(hours=3), {"account": "service_acc", "cmd": "/bin/bash"}),
            ("EVT-1004", "data_transfer", "high", "5.2 GB outbound transfer to unknown IP 203.0.113.88", "10.10.2.5", now - timedelta(hours=2), {"bytes": 5583457280, "dest_ip": "203.0.113.88"}),
            ("EVT-1005", "login_failed", "high", "12 failed login attempts for administrator on Web Portal", "45.33.32.156", now - timedelta(minutes=45), {"failed_attempts": 12, "target": "administrator"}),
            ("EVT-1006", "network_scan", "low", "Port scan detected on corporate firewall", "185.220.101.5", now - timedelta(minutes=20), {"ports_scanned": 1024}),
        ]

        created_events = []
        for ext_id, etype, sev, msg, ip, occ_at, meta in events_data:
            evt, _ = Event.objects.get_or_create(
                tenant=horizon,
                source=h_src1 if "core" in msg or "sudo" in msg else h_src2,
                external_event_id=ext_id,
                defaults={
                    "event_type": etype,
                    "severity": sev,
                    "message": msg,
                    "source_ip": ip,
                    "metadata": meta,
                    "occurred_at": occ_at,
                },
            )
            created_events.append(evt)

        # Alerts
        # Alert 1: from EVT-1002 (Brute force) - Escalated into incident
        alert1, _ = Alert.objects.get_or_create(
            tenant=horizon,
            event=created_events[1],
            rule=rule_brute,
            defaults={
                "title": f"Alert: {rule_brute.name} on {created_events[1].source_ip}",
                "severity": "high",
                "status": "escalated",
                "assignee": h_analyst1,
                "triage_notes": "Multiple brute-force attempts from suspicious external IP. Escalated to incident.",
                "rule_snapshot": {"rule_name": rule_brute.name, "severity": rule_brute.severity},
            },
        )
        # Alert 2: from EVT-1003 (Privilege escalation) - In review
        alert2, _ = Alert.objects.get_or_create(
            tenant=horizon,
            event=created_events[2],
            rule=rule_priv,
            defaults={
                "title": f"Alert: {rule_priv.name} on Core Banking Server",
                "severity": "critical",
                "status": "in_review",
                "assignee": h_analyst2,
                "triage_notes": "Currently investigating cron jobs and running processes under service_acc.",
                "rule_snapshot": {"rule_name": rule_priv.name, "severity": rule_priv.severity},
            },
        )
        # Alert 3: from EVT-1005 (Failed logins on portal) - New
        Alert.objects.get_or_create(
            tenant=horizon,
            event=created_events[4],
            rule=rule_brute,
            defaults={
                "title": f"Alert: {rule_brute.name} on Customer Web Portal",
                "severity": "high",
                "status": "new",
                "triage_notes": "",
                "rule_snapshot": {"rule_name": rule_brute.name, "severity": rule_brute.severity},
            },
        )
        self.stdout.write("  [+] Events & Alerts ready.")

        # 7. Playbooks & Steps
        pb_brute, _ = Playbook.objects.get_or_create(
            tenant=horizon,
            name="Brute Force Incident Response",
            defaults={
                "category": "Authentication",
                "description": "Standard containment procedure for external brute force and credential stuffing attacks.",
                "enabled": True,
            },
        )
        pb_steps = [
            (1, "Isolate Source IP at Perimeter Firewall", "Add source IP to drop table on fw-edge-01 and verify zero throughput.", True),
            (2, "Force Password Reset & Invalidate Active Sessions", "Reset compromised or targeted accounts in Active Directory.", True),
            (3, "Examine Auth Logs for Secondary Ingress", "Check for successful logins from same IP range within ±2 hours.", True),
            (4, "File Regulatory Incident Report", "Submit initial assessment to compliance officer if PII accessed.", False),
        ]
        for pos, title, instr, req in pb_steps:
            PlaybookStep.objects.get_or_create(
                playbook=pb_brute,
                position=pos,
                defaults={"title": title, "instructions": instr, "required": req},
            )
        self.stdout.write("  [+] Playbooks ready.")

        # 8. Incident
        inc, _ = Incident.objects.get_or_create(
            reference="INC-2024-001",
            defaults={
                "tenant": horizon,
                "title": "Brute Force Attack and Lateral Movement on Core Server",
                "description": "Persistent unauthorized SSH login attempts detected from IP 198.51.100.45 targeting srv-core-01.",
                "severity": "high",
                "status": "containment",
                "owner": h_lead,
                "creator": h_analyst1,
            },
        )
        alert1.incident = inc
        alert1.save()

        # Timeline Entries
        TimelineEntry.objects.get_or_create(
            incident=inc,
            tenant=horizon,
            entry_type="status_change",
            message="Incident created and escalated from Alert: Brute Force Authentication Failure",
            actor=h_analyst1,
        )
        TimelineEntry.objects.get_or_create(
            incident=inc,
            tenant=horizon,
            entry_type="note",
            message="Perimeter firewall log analysis shows 87 requests in 3 minutes. Attacker IP geolocated to unknown proxy.",
            actor=h_analyst1,
        )
        TimelineEntry.objects.get_or_create(
            incident=inc,
            tenant=horizon,
            entry_type="playbook_applied",
            message="Applied Playbook: Brute Force Incident Response (4 tasks generated).",
            actor=h_lead,
        )
        TimelineEntry.objects.get_or_create(
            incident=inc,
            tenant=horizon,
            entry_type="status_change",
            message="Incident transitioned to Containment phase.",
            actor=h_lead,
        )

        # Action Tasks
        Action.objects.get_or_create(
            incident=inc,
            tenant=horizon,
            title="Isolate Source IP at Perimeter Firewall",
            defaults={
                "instructions": "Add source IP to drop table on fw-edge-01 and verify zero throughput.",
                "required": True,
                "status": "completed",
                "assignee": h_analyst1,
                "completed_by": h_analyst1,
                "completed_at": timezone.now() - timedelta(hours=1),
                "completion_notes": "IP 198.51.100.45 blocked in firewall ACL. Zero ingress confirmed.",
            },
        )
        Action.objects.get_or_create(
            incident=inc,
            tenant=horizon,
            title="Force Password Reset & Invalidate Active Sessions",
            defaults={
                "instructions": "Reset compromised or targeted accounts in Active Directory.",
                "required": True,
                "status": "in_progress",
                "assignee": h_analyst2,
            },
        )
        Action.objects.get_or_create(
            incident=inc,
            tenant=horizon,
            title="Examine Auth Logs for Secondary Ingress",
            defaults={
                "instructions": "Check for successful logins from same IP range within ±2 hours.",
                "required": True,
                "status": "pending",
                "assignee": h_analyst1,
            },
        )

        # Write the attachment before publishing its downloadable record.
        sample = b"OmniEdge fictional evidence: reviewed synthetic sign-in activity.\n"
        digest = hashlib.sha256(sample).hexdigest()
        folder = Path(settings.EVIDENCE_ROOT).resolve() / "demo" / str(horizon.pk) / str(inc.pk)
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{digest}.txt"
        if not path.exists():
            path.write_bytes(sample)
        legacy = Evidence.objects.filter(
            incident=inc, tenant=horizon,
            original_filename="firewall_drop_log_20241124.pcap",
            stored_path="evidence/horizon/inc1/firewall_drop_log_20241124.pcap",
        )
        filename = "fictional-investigation-note.txt"
        attachment = Evidence.objects.filter(incident=inc, tenant=horizon, original_filename=filename)
        details = {
            "uploader": h_analyst1,
            "stored_path": str(path),
            "file_type": "text/plain",
            "file_size": len(sample),
            "sha256": digest,
            "description": "Fictional investigation notes for the demonstration.",
        }
        if not attachment.exists() and legacy.exists():
            legacy.update(original_filename=filename, **details)
        else:
            Evidence.objects.get_or_create(incident=inc, tenant=horizon, original_filename=filename, defaults=details)
        self.stdout.write("  [+] Incidents, Timeline, Tasks, Evidence ready.")

        # 9. Report snapshot calculated from demo records
        period_end = timezone.localdate()
        period_start = period_end - timedelta(days=30)
        Report.objects.get_or_create(
            tenant=horizon,
            title="Demo SOC Operations Snapshot",
            defaults={
                "period_start": period_start,
                "period_end": period_end,
                "generated_by": h_lead,
                "metrics": lambda: report_metrics(horizon, period_start, period_end),
            },
        )
        self.stdout.write("  [+] Security Reports ready.")
        self.stdout.write(self.style.SUCCESS("OmniEdge demonstration data seeded successfully!"))
