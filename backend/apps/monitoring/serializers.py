"""
Monitoring serializers: Asset, LogSource, Event, Rule, Alert.
"""
import hashlib
from django.utils import timezone
from rest_framework import serializers
from .models import Asset, LogSource, Event, Rule, Alert
from apps.core.serializers import UserMeSerializer
from apps.core.utils import generate_secret_key, hash_secret


class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = [
            "id", "tenant", "name", "hostname", "ip_address",
            "asset_type", "criticality", "status", "description",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "tenant", "created_at", "updated_at"]

    def validate_ip_address(self, value):
        return value  # GenericIPAddressField handles validation


class AssetMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = ["id", "name", "hostname", "ip_address", "asset_type", "criticality"]


class LogSourceSerializer(serializers.ModelSerializer):
    asset = serializers.PrimaryKeyRelatedField(queryset=Asset.objects.all())
    secret_key_display = serializers.SerializerMethodField()
    asset_detail = AssetMinimalSerializer(source="asset", read_only=True)

    class Meta:
        model = LogSource
        fields = [
            "id", "tenant", "asset", "asset_detail", "name", "source_type",
            "secret_key_display", "enabled", "last_seen",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "tenant", "secret_key_display", "last_seen",
            "created_at", "updated_at",
        ]

    def validate_asset(self, asset):
        if asset.tenant_id != self.context["request"].user.tenant_id:
            raise serializers.ValidationError("Choose an asset in your organization.")
        return asset

    def get_secret_key_display(self, obj) -> str:
        return f"{obj.secret_prefix}{'*' * 32}"


class LogSourceCreateSerializer(LogSourceSerializer):
    """Returns plaintext key once on creation."""
    plain_secret_key = serializers.SerializerMethodField()

    class Meta(LogSourceSerializer.Meta):
        fields = LogSourceSerializer.Meta.fields + ["plain_secret_key"]

    def get_plain_secret_key(self, obj):
        return getattr(obj, "_plain_secret_key", None)


class EventSerializer(serializers.ModelSerializer):
    source_name = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "id", "tenant", "source", "source_name",
            "external_event_id", "event_type", "severity", "message",
            "source_ip", "metadata", "payload_hash", "occurred_at", "received_at",
        ]
        read_only_fields = ["id", "tenant", "payload_hash", "received_at"]

    def get_source_name(self, obj):
        return obj.source.name if obj.source_id else None


class EventIngestSerializer(serializers.Serializer):
    """Serializer used by the ingest endpoint (key auth)."""
    external_event_id = serializers.CharField(max_length=255, required=False, allow_blank=True)
    event_type = serializers.CharField(max_length=100)
    severity = serializers.ChoiceField(choices=["info", "low", "medium", "high", "critical"], default="info")
    message = serializers.CharField()
    source_ip = serializers.IPAddressField(required=False, allow_null=True)
    metadata = serializers.DictField(required=False, default=dict)
    occurred_at = serializers.DateTimeField(required=False)

    def validate_occurred_at(self, value):
        return value or timezone.now()


class RuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rule
        fields = [
            "id", "tenant", "name", "description", "event_type",
            "conditions", "severity", "enabled", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "tenant", "created_at", "updated_at"]

    def validate_conditions(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Conditions must be a JSON object.")
        for field, condition in value.items():
            if field not in ("severity", "message", "source_ip", "event_type") and not field.startswith("metadata__"):
                raise serializers.ValidationError(f"Unsupported match field: {field}.")
            if isinstance(condition, dict):
                if len(condition) != 1 or not condition.keys() <= {"eq", "gte", "lte", "contains"}:
                    raise serializers.ValidationError(f"Choose one supported operator for {field}.")
                operator, expected = next(iter(condition.items()))
                if operator in ("gte", "lte") and type(expected) not in (int, float):
                    raise serializers.ValidationError(f"{operator} requires a number.")
                if operator == "contains" and not isinstance(expected, str):
                    raise serializers.ValidationError("contains requires text.")
                condition = expected
            values = condition if isinstance(condition, list) else [condition]
            if any(type(item) not in (str, int, float, bool, type(None)) for item in values):
                raise serializers.ValidationError(f"Use scalar match values for {field}.")
        return value


class AlertSerializer(serializers.ModelSerializer):
    rule_name = serializers.CharField(source="rule.name", read_only=True, allow_null=True)
    assignee_detail = serializers.SerializerMethodField()
    event_detail = serializers.SerializerMethodField()

    class Meta:
        model = Alert
        fields = [
            "id", "tenant", "event", "event_detail", "rule", "rule_name",
            "incident", "title", "severity", "status",
            "assignee", "assignee_detail",
            "triage_notes", "dismissal_reason", "rule_snapshot",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "tenant", "event", "rule", "title",
            "rule_snapshot", "created_at", "updated_at",
        ]

    def get_assignee_detail(self, obj):
        if obj.assignee_id:
            return {"id": obj.assignee.id, "email": obj.assignee.email, "full_name": obj.assignee.full_name}
        return None

    def get_event_detail(self, obj):
        return {
            "id": obj.event_id,
            "event_type": obj.event.event_type,
            "severity": obj.event.severity,
            "occurred_at": obj.event.occurred_at,
        }


class AlertTriageSerializer(serializers.Serializer):
    severity = serializers.ChoiceField(choices=["low", "medium", "high", "critical"], required=False)
    notes = serializers.CharField(required=False, allow_blank=True)


class AlertDismissSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=5)


class AlertEscalateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=500, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    severity = serializers.ChoiceField(
        choices=["low", "medium", "high", "critical"],
        required=False,
    )


class SimulatorSerializer(serializers.Serializer):
    event_type = serializers.CharField(max_length=100, required=False)
    severity = serializers.ChoiceField(
        choices=["info", "low", "medium", "high", "critical"], required=False
    )
    count = serializers.IntegerField(min_value=1, max_value=50, required=False)
    batch_size = serializers.IntegerField(min_value=1, max_value=50, required=False)
    source_id = serializers.IntegerField(required=False)

    def validate(self, attrs):
        attrs["count"] = attrs.get("count", attrs.get("batch_size", 1))
        return attrs
