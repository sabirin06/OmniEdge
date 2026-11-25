"""
Monitoring models: Asset, LogSource, Event, Rule, Alert.
"""
import hashlib
from django.db import models
from apps.core.models import Tenant, User


class Asset(models.Model):
    ASSET_TYPE_CHOICES = [
        ("server", "Server"),
        ("workstation", "Workstation"),
        ("network_device", "Network Device"),
        ("application", "Application"),
        ("database", "Database"),
        ("cloud_resource", "Cloud Resource"),
        ("other", "Other"),
    ]
    CRITICALITY_CHOICES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
        ("critical", "Critical"),
    ]
    STATUS_CHOICES = [
        ("active", "Active"),
        ("inactive", "Inactive"),
        ("decommissioned", "Decommissioned"),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="assets")
    name = models.CharField(max_length=255)
    hostname = models.CharField(max_length=255, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    asset_type = models.CharField(max_length=50, choices=ASSET_TYPE_CHOICES, default="other")
    criticality = models.CharField(max_length=20, choices=CRITICALITY_CHOICES, default="medium", db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active", db_index=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "monitoring_asset"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "criticality"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.ip_address})"


class LogSource(models.Model):
    SOURCE_TYPE_CHOICES = [
        ("syslog", "Syslog"),
        ("windows_event", "Windows Event Log"),
        ("json_http", "JSON/HTTP"),
        ("cef", "CEF"),
        ("leef", "LEEF"),
        ("aws_cloudtrail", "AWS CloudTrail"),
        ("azure_monitor", "Azure Monitor"),
        ("custom", "Custom"),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="log_sources")
    asset = models.ForeignKey(Asset, null=True, blank=True, on_delete=models.SET_NULL, related_name="log_sources")
    name = models.CharField(max_length=255)
    source_type = models.CharField(max_length=50, choices=SOURCE_TYPE_CHOICES, default="json_http")
    secret_key = models.CharField(max_length=64)      # SHA-256 of real key
    secret_prefix = models.CharField(max_length=8)    # First 8 chars for display
    enabled = models.BooleanField(default=True, db_index=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "monitoring_logsource"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["tenant", "enabled"]),
        ]

    def __str__(self):
        return f"{self.name} [{self.secret_prefix}...]"


class Event(models.Model):
    SEVERITY_CHOICES = [
        ("info", "Info"),
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
        ("critical", "Critical"),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="events")
    source = models.ForeignKey(LogSource, on_delete=models.CASCADE, related_name="events")
    external_event_id = models.CharField(max_length=255, blank=True, db_index=True)
    event_type = models.CharField(max_length=100, db_index=True)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default="info", db_index=True)
    reviewed_risk = models.CharField(
        max_length=20, choices=[("low", "Low"), ("medium", "Medium"), ("high", "High"), ("critical", "Critical")],
        null=True, blank=True,
    )
    risk_review_reason = models.TextField(blank=True, default="")
    message = models.TextField()
    source_ip = models.GenericIPAddressField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    payload_hash = models.CharField(max_length=64, blank=True, db_index=True)
    occurred_at = models.DateTimeField()
    received_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "monitoring_event"
        ordering = ["-received_at"]
        indexes = [
            models.Index(fields=["tenant", "event_type"]),
            models.Index(fields=["tenant", "severity"]),
            models.Index(fields=["tenant", "received_at"]),
            models.Index(fields=["source", "external_event_id"]),
        ]
        # Dedup: same external_event_id per source is allowed to have one record
        # (payload_hash is used for content-level dedup)

    def __str__(self):
        return f"[{self.severity}] {self.event_type} @ {self.occurred_at}"


class Rule(models.Model):
    SEVERITY_CHOICES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
        ("critical", "Critical"),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="rules")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    event_type = models.CharField(max_length=100)
    conditions = models.JSONField(default=dict, help_text="e.g. {'severity': 'high', 'source_ip': '...', 'metadata__key': 'value'}")
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default="medium")
    enabled = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "monitoring_rule"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["tenant", "enabled"]),
            models.Index(fields=["tenant", "event_type"]),
        ]

    def __str__(self):
        return f"{self.name} [{self.severity}]"

    def matches_event(self, event: "Event") -> bool:
        """Return True if the event satisfies this rule's conditions."""
        if not self.enabled:
            return False
        if self.event_type and self.event_type != event.event_type:
            return False
        for key, expected in self.conditions.items():
            # Support flat field checks and metadata__ prefix
            if key.startswith("metadata__"):
                meta_key = key[len("metadata__"):]
                actual = event.metadata.get(meta_key)
            else:
                actual = getattr(event, key, None)
            if isinstance(expected, dict):
                if len(expected) != 1:
                    return False
                operator, threshold = next(iter(expected.items()))
                if operator == "eq":
                    matches = str(actual).casefold() == str(threshold).casefold()
                elif operator == "contains":
                    matches = isinstance(actual, str) and isinstance(threshold, str) and threshold.casefold() in actual.casefold()
                elif operator in ("gte", "lte") and type(actual) in (int, float) and type(threshold) in (int, float):
                    matches = actual >= threshold if operator == "gte" else actual <= threshold
                else:
                    matches = False
                if not matches:
                    return False
            elif isinstance(expected, list):
                if actual not in expected:
                    return False
            else:
                if str(actual).lower() != str(expected).lower():
                    return False
        return True


class Alert(models.Model):
    STATUS_CHOICES = [
        ("new", "New"),
        ("in_review", "In Review"),
        ("dismissed", "Dismissed"),
        ("escalated", "Escalated"),
        ("resolved", "Resolved"),
    ]
    SEVERITY_CHOICES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
        ("critical", "Critical"),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="alerts")
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="alerts")
    rule = models.ForeignKey(Rule, on_delete=models.CASCADE, related_name="alerts")
    incident = models.ForeignKey(
        "incidents.Incident",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="alerts",
    )
    title = models.CharField(max_length=500)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default="medium", db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="new", db_index=True)
    assignee = models.ForeignKey(
        User,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_alerts",
    )
    triage_notes = models.TextField(blank=True)
    dismissal_reason = models.TextField(blank=True)
    rule_snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "monitoring_alert"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["tenant", "severity"]),
            models.Index(fields=["tenant", "assignee"]),
        ]

    def __str__(self):
        return f"{self.title} [{self.status}]"
