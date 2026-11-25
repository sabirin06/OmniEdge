from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Tenant
from apps.monitoring.models import Rule


WINDOWS_RULES = (
    ("Windows application hang", "application", 1002, "Application Hang", "low",
     "A single application stopped responding. Review recurring hangs or effects on critical services."),
    ("Windows failed logon", "security", 4625, "Microsoft-Windows-Security-Auditing", "medium",
     "A failed logon merits review. A single failure does not establish account compromise."),
    ("Windows volume requires offline repair", "system", 98, ["Ntfs", "Microsoft-Windows-Ntfs"], "high",
     "Windows reported a filesystem condition requiring an offline volume check."),
    ("Windows NTFS filesystem corruption", "system", 55, ["Ntfs", "Microsoft-Windows-Ntfs"], "critical",
     "Windows reported an unusable filesystem structure. This can affect data availability or integrity."),
)


class Command(BaseCommand):
    help = "Install provider-specific Windows risk rules in one tenant without altering existing rules or events."

    def add_arguments(self, parser):
        parser.add_argument("--tenant-id", type=int, required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            tenant = Tenant.objects.select_for_update().get(pk=options["tenant_id"])
        except Tenant.DoesNotExist as exc:
            raise CommandError("Tenant not found.") from exc
        for name, channel, event_id, provider, severity, description in WINDOWS_RULES:
            rule, created = Rule.objects.get_or_create(tenant=tenant, name=name, defaults={
                "event_type": f"windows.{channel}.{event_id}",
                "conditions": {"metadata__provider": provider},
                "severity": severity, "description": description, "enabled": True,
            })
            action = "Created" if created else "Kept"
            self.stdout.write(f"{action}: {rule.name} ({rule.severity}).")
