"""
Incidents serializers.
"""
import os
from django.conf import settings
from rest_framework import serializers
from .models import Incident, TimelineEntry, Evidence, Playbook, PlaybookStep, Action, Report, AuditLog
from .reporting import REPORT_TYPES, ALERT_STATUSES, INCIDENT_STATUSES
from .report_records import RECORD_SORTS
from apps.core.models import User
from apps.core.serializers import AuditLogSerializer


class IncidentSerializer(serializers.ModelSerializer):
    owner_detail = serializers.SerializerMethodField()
    creator_detail = serializers.SerializerMethodField()
    alert_count = serializers.SerializerMethodField()

    class Meta:
        model = Incident
        fields = [
            "id", "tenant", "reference", "title", "description",
            "severity", "status",
            "owner", "owner_detail", "creator", "creator_detail",
            "resolution_summary", "resolved_at", "closed_at", "closed_by",
            "alert_count", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "tenant", "reference", "creator",
            "resolved_at", "closed_at", "closed_by",
            "created_at", "updated_at",
        ]

    def get_owner_detail(self, obj) -> dict | None:
        if obj.owner_id:
            return {"id": obj.owner.id, "email": obj.owner.email, "full_name": obj.owner.full_name}
        return None

    def get_creator_detail(self, obj) -> dict | None:
        if obj.creator_id:
            return {"id": obj.creator.id, "email": obj.creator.email, "full_name": obj.creator.full_name}
        return None

    def get_alert_count(self, obj) -> int:
        return obj.alerts.count()


def tenant_member(user, request):
    if user and (user.tenant_id != request.user.tenant_id or not user.is_active):
        raise serializers.ValidationError("Choose an active member of your organization.")
    return user


class IncidentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Incident
        fields = ["title", "description", "severity", "owner"]

    def validate_owner(self, value):
        return tenant_member(value, self.context["request"])


class IncidentTransitionSerializer(serializers.Serializer):
    new_status = serializers.ChoiceField(choices=[c[0] for c in Incident.STATUS_CHOICES], required=False)
    status = serializers.ChoiceField(choices=[c[0] for c in Incident.STATUS_CHOICES], required=False)
    resolution_summary = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        st = attrs.get("new_status") or attrs.get("status")
        if not st:
            raise serializers.ValidationError({"new_status": "Status is required."})
        attrs["new_status"] = st
        incident = self.context["incident"]
        if not incident.can_transition_to(st):
            allowed = Incident.TRANSITIONS.get(incident.status, [])
            raise serializers.ValidationError(
                {"new_status": f"Cannot transition from '{incident.status}' to '{st}'. Allowed: {allowed}"}
            )
        if st == "resolved":
            if not attrs.get("resolution_summary"):
                raise serializers.ValidationError({"resolution_summary": "A resolution summary is required."})
            if incident.actions.filter(required=True).exclude(status="completed").exists():
                raise serializers.ValidationError({"new_status": "Complete all required tasks before resolving."})
        return attrs


class TimelineEntrySerializer(serializers.ModelSerializer):
    actor_detail = serializers.SerializerMethodField()

    class Meta:
        model = TimelineEntry
        fields = [
            "id", "incident", "tenant", "actor", "actor_detail",
            "entry_type", "message", "metadata", "created_at",
        ]
        read_only_fields = ["id", "incident", "tenant", "actor", "created_at", "metadata", "entry_type"]

    def get_actor_detail(self, obj) -> dict | None:
        if obj.actor_id:
            return {"id": obj.actor.id, "email": obj.actor.email, "full_name": obj.actor.full_name}
        return None


class EvidenceSerializer(serializers.ModelSerializer):
    uploader_detail = serializers.SerializerMethodField()

    class Meta:
        model = Evidence
        fields = [
            "id", "incident", "tenant", "uploader", "uploader_detail",
            "original_filename", "file_type", "file_size", "sha256",
            "description", "uploaded_at",
        ]
        read_only_fields = [
            "id", "incident", "tenant", "uploader",
            "original_filename", "stored_path", "file_type",
            "file_size", "sha256", "uploaded_at",
        ]

    def get_uploader_detail(self, obj) -> dict | None:
        if obj.uploader_id:
            return {"id": obj.uploader.id, "email": obj.uploader.email}
        return None


class EvidenceUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    description = serializers.CharField(required=False, allow_blank=True)

    def validate_file(self, value):
        max_size = getattr(settings, "EVIDENCE_MAX_SIZE_MB", 50) * 1024 * 1024
        if value.size > max_size:
            raise serializers.ValidationError(
                f"File size exceeds limit of {settings.EVIDENCE_MAX_SIZE_MB} MB."
            )
        allowed = getattr(settings, "EVIDENCE_ALLOWED_TYPES", [])
        if allowed and value.content_type not in allowed:
            raise serializers.ValidationError(
                f"File type '{value.content_type}' is not allowed."
            )
        signatures = {"application/pdf": b"%PDF-", "image/png": b"\x89PNG\r\n\x1a\n", "image/jpeg": b"\xff\xd8\xff"}
        header = value.read(8192)
        value.seek(0)
        signature = signatures.get(value.content_type)
        if signature and not header.startswith(signature):
            raise serializers.ValidationError("The file contents do not match its declared type.")
        if value.content_type == "text/plain":
            try:
                header.decode("utf-8")
            except UnicodeDecodeError:
                raise serializers.ValidationError("Upload UTF-8 text.")
            if b"\x00" in header:
                raise serializers.ValidationError("Upload a text file.")
        return value


class PlaybookApplicationSerializer(serializers.Serializer):
    playbook_id = serializers.IntegerField(min_value=1)
    assignee = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, allow_null=True)

    def validate_assignee(self, value):
        return tenant_member(value, self.context["request"])


class PlaybookStepSerializer(serializers.ModelSerializer):
    position = serializers.IntegerField(min_value=1)
    class Meta:
        model = PlaybookStep
        fields = ["id", "playbook", "position", "title", "instructions", "required"]
        read_only_fields = ["id", "playbook"]


class PlaybookSerializer(serializers.ModelSerializer):
    steps = PlaybookStepSerializer(many=True, read_only=True)
    step_count = serializers.SerializerMethodField()

    class Meta:
        model = Playbook
        fields = [
            "id", "tenant", "name", "category", "description",
            "enabled", "step_count", "steps", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "tenant", "created_at", "updated_at"]

    def get_step_count(self, obj) -> int:
        return obj.steps.count()


class ActionSerializer(serializers.ModelSerializer):
    assignee_detail = serializers.SerializerMethodField()

    class Meta:
        model = Action
        fields = [
            "id", "tenant", "incident", "playbook_step", "title", "instructions",
            "required", "status", "assignee", "assignee_detail",
            "due_at", "completion_notes", "completed_at", "completed_by",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "tenant", "incident", "created_at", "updated_at",
            "completed_at", "completed_by", "playbook_step", "status", "completion_notes",
        ]

    def validate_assignee(self, value):
        return tenant_member(value, self.context["request"])

    def get_assignee_detail(self, obj) -> dict | None:
        if obj.assignee_id:
            return {"id": obj.assignee.id, "email": obj.assignee.email, "full_name": obj.assignee.full_name}
        return None


class ActionTransitionSerializer(serializers.Serializer):
    assignee = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, allow_null=True)

    def validate_assignee(self, value):
        return tenant_member(value, self.context["request"])

    new_status = serializers.ChoiceField(choices=[c[0] for c in Action.STATUS_CHOICES], required=False)
    status = serializers.ChoiceField(choices=[c[0] for c in Action.STATUS_CHOICES], required=False)
    completion_notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        st = attrs.get("new_status") or attrs.get("status")
        if not st and "assignee" not in attrs:
            raise serializers.ValidationError({"new_status": "Choose a status or assignee."})
        if st:
            attrs["new_status"] = st
        return attrs


class ReportSerializer(serializers.ModelSerializer):
    generated_by_detail = serializers.SerializerMethodField()

    class Meta:
        model = Report
        fields = [
            "id", "tenant", "title", "period_start", "period_end",
            "metrics", "generated_by", "generated_by_detail", "created_at",
        ]
        read_only_fields = ["id", "tenant", "metrics", "generated_by", "created_at"]

    def get_generated_by_detail(self, obj) -> dict | None:
        if obj.generated_by_id:
            return {"id": obj.generated_by.id, "email": obj.generated_by.email}
        return None


class ReportFiltersSerializer(serializers.Serializer):
    period_start = serializers.DateField()
    period_end = serializers.DateField()
    report_type = serializers.ChoiceField(choices=REPORT_TYPES, required=False)
    severity = serializers.ChoiceField(choices=("info", "low", "medium", "high", "critical"), required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=sorted(set(ALERT_STATUSES + INCIDENT_STATUSES)), required=False, allow_blank=True)
    tenant = serializers.IntegerField(min_value=1, required=False)

    def validate(self, attrs):
        start, end = attrs["period_start"], attrs["period_end"]
        if end < start:
            raise serializers.ValidationError({"period_end": "Choose an end date on or after the start date."})
        if (end - start).days >= 366:
            raise serializers.ValidationError({"period_end": "Choose a range of 366 days or fewer."})
        statuses = {"alerts": ALERT_STATUSES, "incidents": INCIDENT_STATUSES, "events": ()}
        report_type = attrs.get("report_type", "overview")
        if attrs.get("status") and report_type in statuses and attrs["status"] not in statuses[report_type]:
            raise serializers.ValidationError({"status": "Choose a status available for this report type."})
        return attrs


class ReportCreateSerializer(ReportFiltersSerializer):
    title = serializers.CharField(max_length=500)


class ReportDownloadSerializer(ReportFiltersSerializer):
    export = serializers.ChoiceField(choices=("csv", "pdf"))


class ReportRecordFiltersSerializer(ReportFiltersSerializer):
    search = serializers.CharField(max_length=200, required=False, allow_blank=True)
    ordering = serializers.ChoiceField(choices=RECORD_SORTS, required=False)


class ReportRecordListSerializer(ReportRecordFiltersSerializer):
    page = serializers.IntegerField(min_value=1, max_value=2147483647, required=False, default=1)


class ReportRecordDownloadSerializer(ReportRecordFiltersSerializer):
    export = serializers.ChoiceField(choices=("csv", "pdf"))
