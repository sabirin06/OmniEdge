"""Record authenticated changes to foundation and monitoring records."""
from django.db.models.signals import post_save
from django.dispatch import receiver

from .middleware import get_current_request


AUDITED_FIELDS = {
    "core.tenant": ("name", "code", "status"),
    "core.user": ("role", "tenant_id", "is_active"),
    "core.managedrole": ("name", "base_role"),
    "monitoring.asset": ("name", "asset_type", "criticality", "status"),
    "monitoring.logsource": ("name", "asset_id", "enabled"),
    "monitoring.rule": ("name", "event_type", "severity", "enabled"),
    "incidents.playbook": ("name", "category", "enabled"),
    "monitoring.alert": ("status", "severity", "assignee_id", "incident_id"),
}


@receiver(post_save)
def audit_record_change(sender, instance, created, raw=False, update_fields=None, **kwargs):
    label = instance._meta.label_lower
    fields = AUDITED_FIELDS.get(label)
    if raw or fields is None:
        return
    if label == "core.user" and update_fields == {"last_login"}:
        return
    request = get_current_request()
    actor = getattr(request, "user", None)
    if actor is None or not actor.is_authenticated:
        return

    from apps.incidents.models import AuditLog

    tenant_id = instance.pk if label == "core.tenant" else getattr(instance, "tenant_id", None)
    action = "created" if created else "updated"
    if label == "monitoring.logsource" and update_fields and "secret_key" in update_fields:
        action = "key_rotated"
    elif label == "monitoring.logsource" and update_fields == {"last_seen"}:
        return
    AuditLog.objects.create(
        tenant_id=tenant_id,
        actor=actor,
        action=f"{sender._meta.model_name}.{action}",
        entity_type=sender.__name__,
        entity_id=str(instance.pk),
        changes={field: getattr(instance, field) for field in fields},
        request_id=request.request_id,
    )
