"""
Incidents serializers.
"""
import os
from django.conf import settings
from rest_framework import serializers
from .models import Incident, TimelineEntry, Evidence, Playbook, PlaybookStep, Action, Report, AuditLog
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

    def get_owner_detail(self, obj):
        if obj.owner_id:
            return {"id": obj.owner.id, "email": obj.owner.email, "full_name": obj.owner.full_name}
        return None

    def get_creator_detail(self, obj):
        if obj.creator_id:
            return {"id": obj.creator.id, "email": obj.creator.email, "full_name": obj.creator.full_name}
        return None

    def get_alert_count(self, obj):
        return obj.alerts.count()


class IncidentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Incident
        fields = ["title", "description", "severity", "owner"]


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
        return attrs


class TimelineEntrySerializer(serializers.ModelSerializer):
    actor_detail = serializers.SerializerMethodField()

    class Meta:
        model = TimelineEntry
        fields = [
            "id", "incident", "tenant", "actor", "actor_detail",
            "entry_type", "message", "metadata", "created_at",
        ]
        read_only_fields = ["id", "incident", "tenant", "actor", "created_at"]

    def get_actor_detail(self, obj):
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

    def get_uploader_detail(self, obj):
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
        return value


class PlaybookStepSerializer(serializers.ModelSerializer):
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

    def get_step_count(self, obj):
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
            "completed_at", "completed_by",
        ]

    def get_assignee_detail(self, obj):
        if obj.assignee_id:
            return {"id": obj.assignee.id, "email": obj.assignee.email, "full_name": obj.assignee.full_name}
        return None


class ActionTransitionSerializer(serializers.Serializer):
    new_status = serializers.ChoiceField(choices=[c[0] for c in Action.STATUS_CHOICES], required=False)
    status = serializers.ChoiceField(choices=[c[0] for c in Action.STATUS_CHOICES], required=False)
    completion_notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        st = attrs.get("new_status") or attrs.get("status")
        if not st:
            raise serializers.ValidationError({"new_status": "Status is required."})
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

    def get_generated_by_detail(self, obj):
        if obj.generated_by_id:
            return {"id": obj.generated_by.id, "email": obj.generated_by.email}
        return None


class ReportCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=500)
    period_start = serializers.DateField()
    period_end = serializers.DateField()

    def validate(self, attrs):
        if attrs["period_end"] < attrs["period_start"]:
            raise serializers.ValidationError({"period_end": "End date must be after start date."})
        return attrs
