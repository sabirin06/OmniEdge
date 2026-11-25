"""
Incidents models: Incident, TimelineEntry, Evidence, Playbook, PlaybookStep,
Action (containment task), Report, AuditLog.
"""
import os
from django.db import models
from django.utils import timezone
from apps.core.models import Tenant, User


class Incident(models.Model):
    STATUS_CHOICES = [
        ("open", "Open"),
        ("investigating", "Investigating"),
        ("containment", "Containment"),
        ("resolved", "Resolved"),
        ("closed", "Closed"),
    ]
    SEVERITY_CHOICES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
        ("critical", "Critical"),
    ]
    # Valid transitions map: current_status -> [allowed_next]
    TRANSITIONS = {
        "open": ["investigating"],
        "investigating": ["containment", "resolved"],
        "containment": ["resolved"],
        "resolved": ["closed"],
        "closed": [],
    }

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="incidents")
    reference = models.CharField(max_length=50, unique=True, db_index=True)
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default="medium", db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open", db_index=True)
    owner = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="owned_incidents")
    creator = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="created_incidents")
    resolution_summary = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="closed_incidents"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "incidents_incident"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "severity"]),
            models.Index(fields=["tenant", "owner"]),
        ]

    def __str__(self):
        return f"{self.reference}: {self.title}"

    def can_transition_to(self, new_status: str) -> bool:
        return new_status in self.TRANSITIONS.get(self.status, [])


class TimelineEntry(models.Model):
    ENTRY_TYPES = [
        ("note", "Note"),
        ("status_change", "Status Change"),
        ("alert_linked", "Alert Linked"),
        ("evidence_added", "Evidence Added"),
        ("task_updated", "Task Updated"),
        ("playbook_applied", "Playbook Applied"),
        ("assignment_changed", "Assignment Changed"),
    ]

    incident = models.ForeignKey(Incident, on_delete=models.CASCADE, related_name="timeline_entries")
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    actor = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    entry_type = models.CharField(max_length=30, choices=ENTRY_TYPES, default="note", db_index=True)
    message = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "incidents_timelineentry"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["incident", "created_at"]),
        ]

    def __str__(self):
        return f"[{self.entry_type}] {self.incident.reference} @ {self.created_at}"


def evidence_upload_path(instance, filename):
    """Store evidence in private path: evidence/<tenant_id>/<incident_id>/<filename>."""
    return os.path.join("evidence", str(instance.tenant_id), str(instance.incident_id), filename)


class Evidence(models.Model):
    incident = models.ForeignKey(Incident, on_delete=models.CASCADE, related_name="evidence_files")
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    uploader = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    original_filename = models.CharField(max_length=500)
    stored_path = models.CharField(max_length=1000)   # Private filesystem path
    file_type = models.CharField(max_length=100)
    file_size = models.BigIntegerField()              # bytes
    sha256 = models.CharField(max_length=64, db_index=True)
    description = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "incidents_evidence"
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.original_filename} ({self.incident.reference})"


class Playbook(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="playbooks")
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    enabled = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "incidents_playbook"
        ordering = ["name"]

    def __str__(self):
        return self.name


class PlaybookStep(models.Model):
    playbook = models.ForeignKey(Playbook, on_delete=models.CASCADE, related_name="steps")
    position = models.PositiveIntegerField()
    title = models.CharField(max_length=255)
    instructions = models.TextField()
    required = models.BooleanField(default=True)

    class Meta:
        db_table = "incidents_playbookstep"
        ordering = ["position"]
        unique_together = [("playbook", "position")]

    def __str__(self):
        return f"{self.playbook.name} / Step {self.position}: {self.title}"


class Action(models.Model):
    """Containment task derived from a playbook step or created manually."""
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("skipped", "Skipped"),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    incident = models.ForeignKey(Incident, on_delete=models.CASCADE, related_name="actions")
    playbook_step = models.ForeignKey(PlaybookStep, null=True, blank=True, on_delete=models.SET_NULL)
    title = models.CharField(max_length=255)
    instructions = models.TextField(blank=True)
    required = models.BooleanField(default=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True)
    assignee = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_actions")
    due_at = models.DateTimeField(null=True, blank=True)
    completion_notes = models.TextField(blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="completed_actions"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "incidents_action"
        ordering = ["created_at"]
        constraints = [models.UniqueConstraint(fields=["incident", "playbook_step"], name="unique_incident_playbook_step")]
        indexes = [
            models.Index(fields=["incident", "status"]),
        ]

    def __str__(self):
        return f"{self.title} [{self.status}] @ {self.incident.reference}"


class Report(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="reports")
    title = models.CharField(max_length=500)
    period_start = models.DateField()
    period_end = models.DateField()
    metrics = models.JSONField(default=dict)
    generated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "incidents_report"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.period_start} – {self.period_end})"


class AuditLog(models.Model):
    tenant = models.ForeignKey(Tenant, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs")
    actor = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs")
    action = models.CharField(max_length=255, db_index=True)
    entity_type = models.CharField(max_length=100, db_index=True)
    entity_id = models.CharField(max_length=100, blank=True)
    changes = models.JSONField(default=dict)
    request_id = models.CharField(max_length=36, blank=True)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "incidents_auditlog"
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["tenant", "entity_type"]),
            models.Index(fields=["tenant", "timestamp"]),
        ]

    def __str__(self):
        return f"{self.action} on {self.entity_type}:{self.entity_id} by {self.actor_id}"
