"""
Signals for incidents app:
- Auto-create TimelineEntry on Incident status changes
- Auto-create AuditLog entries
"""
import logging
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import Incident, Action, TimelineEntry, AuditLog
from apps.core.middleware import get_current_request

logger = logging.getLogger(__name__)

@receiver(pre_save, sender=Incident)
def capture_incident_state(sender, instance: Incident, **kwargs):
    """Capture pre-save state for change detection."""
    if instance.pk:
        try:
            old = Incident.objects.get(pk=instance.pk)
            instance._previous_values = {
                "status": old.status,
                "severity": old.severity,
                "owner_id": old.owner_id,
            }
        except Incident.DoesNotExist:
            pass


@receiver(post_save, sender=Incident)
def incident_post_save(sender, instance: Incident, created: bool, **kwargs):
    """Create timeline entries on status/severity/owner changes."""
    request = get_current_request()
    actor = request.user if request and request.user.is_authenticated else None

    if created:
        TimelineEntry.objects.create(
            incident=instance,
            tenant=instance.tenant,
            actor=actor,
            entry_type="status_change",
            message=f"Incident {instance.reference} created with status '{instance.status}'.",
            metadata={"new_status": instance.status, "severity": instance.severity},
        )
        AuditLog.objects.create(
            tenant=instance.tenant,
            actor=actor,
            action="incident.created",
            entity_type="Incident",
            entity_id=str(instance.id),
            changes={"status": instance.status, "severity": instance.severity},
            request_id=getattr(request, "request_id", "") if request else "",
        )
        return

    old = getattr(instance, "_previous_values", {})
    changes = {}

    if old.get("status") and old["status"] != instance.status:
        changes["status"] = {"from": old["status"], "to": instance.status}
        if instance.status == "resolved":
            instance.resolved_at = instance.resolved_at or timezone.now()
        TimelineEntry.objects.create(
            incident=instance,
            tenant=instance.tenant,
            actor=actor,
            entry_type="status_change",
            message=f"Status changed from '{old['status']}' to '{instance.status}'.",
            metadata={"old_status": old["status"], "new_status": instance.status},
        )

    if "owner_id" in old and old["owner_id"] != instance.owner_id:
        changes["owner"] = {"from": old["owner_id"], "to": instance.owner_id}
        TimelineEntry.objects.create(
            incident=instance,
            tenant=instance.tenant,
            actor=actor,
            entry_type="assignment_changed",
            message="Incident ownership reassigned.",
            metadata={"old_owner_id": old["owner_id"], "new_owner_id": instance.owner_id},
        )

    if "severity" in old and old["severity"] != instance.severity:
        changes["severity"] = {"from": old["severity"], "to": instance.severity}

    if changes:
        AuditLog.objects.create(
            tenant=instance.tenant,
            actor=actor,
            action="incident.updated",
            entity_type="Incident",
            entity_id=str(instance.id),
            changes=changes,
            request_id=getattr(request, "request_id", "") if request else "",
        )


@receiver(post_save, sender=Action)
def action_post_save(sender, instance: Action, created: bool, **kwargs):
    """Log action status changes to timeline."""
    if not created:
        return
    TimelineEntry.objects.create(
        incident=instance.incident,
        tenant=instance.tenant,
        actor=instance.assignee,
        entry_type="task_updated",
        message=f"Task '{instance.title}' created with status '{instance.status}'.",
        metadata={"action_id": instance.id, "status": instance.status},
    )
