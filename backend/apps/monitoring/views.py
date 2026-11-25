"""
Monitoring views: Assets, LogSources, Events, Rules, Alerts, Ingest, Simulator.
"""
import hashlib
import logging
import json
from django.contrib.auth import get_user
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsTenantLead, IsTenantCustomerAdmin, IsSOCAnalyst, IsIncidentResponder, CanAccessLogSources
from apps.incidents.serializers import IncidentSerializer
from apps.core.utils import generate_secret_key, hash_secret
from .models import Asset, LogSource, Event, Rule, Alert
from .serializers import (
    AssetSerializer, LogSourceSerializer, LogSourceCreateSerializer,
    EventSerializer, EventIngestSerializer,
    RuleSerializer, AlertSerializer, AlertTriageSerializer,
    AlertDismissSerializer, AlertEscalateSerializer, SimulatorSerializer,
)

logger = logging.getLogger(__name__)


def get_tenant(user):
    return user.tenant


def require_tenant(user):
    if user.tenant_id is None:
        raise ValidationError({"tenant": "Sign in with an organization account for this action."})
    return user.tenant


# ---------------------------------------------------------------------------
# Asset views
# ---------------------------------------------------------------------------

class AssetListCreateView(generics.ListCreateAPIView):
    serializer_class = AssetSerializer

    def get_permissions(self):
        return [IsSOCAnalyst()] if self.request.method in SAFE_METHODS else [IsTenantCustomerAdmin()]
    search_fields = ["name", "hostname", "ip_address"]
    ordering_fields = ["name", "criticality", "status", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        qs = Asset.objects.filter(tenant=get_tenant(self.request.user))
        state = self.request.query_params.get("status")
        return qs.filter(status=state) if state else qs

    def perform_create(self, serializer):
        serializer.save(tenant=require_tenant(self.request.user))


class AssetDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = AssetSerializer

    def get_permissions(self):
        return [IsSOCAnalyst()] if self.request.method in SAFE_METHODS else [IsTenantCustomerAdmin()]

    def get_queryset(self):
        return Asset.objects.filter(tenant=get_tenant(self.request.user))


# ---------------------------------------------------------------------------
# LogSource views
# ---------------------------------------------------------------------------

class LogSourceListCreateView(generics.ListCreateAPIView):
    permission_classes = [CanAccessLogSources]
    search_fields = ["name", "source_type"]
    ordering = ["name"]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return LogSourceCreateSerializer
        return LogSourceSerializer

    def get_queryset(self):
        qs = LogSource.objects.select_related("asset").filter(tenant=get_tenant(self.request.user))
        enabled = self.request.query_params.get("enabled")
        return qs.filter(enabled=enabled == "true") if enabled in ("true", "false") else qs

    def perform_create(self, serializer):
        plain_key = generate_secret_key()
        hashed = hash_secret(plain_key)
        prefix = plain_key[:8]
        instance = serializer.save(
            tenant=require_tenant(self.request.user),
            secret_key=hashed,
            secret_prefix=prefix,
        )
        instance._plain_secret_key = plain_key


class LogSourceDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [CanAccessLogSources]
    serializer_class = LogSourceSerializer

    def get_queryset(self):
        return LogSource.objects.select_related("asset").filter(
            tenant=get_tenant(self.request.user)
        )


class LogSourceRotateKeyView(APIView):
    permission_classes = [IsTenantCustomerAdmin]

    @extend_schema(request=None, responses=inline_serializer(name="RotatedSourceKey", fields={"plain_secret_key": serializers.CharField(), "secret_prefix": serializers.CharField(), "detail": serializers.CharField()}))
    def post(self, request, pk):
        try:
            source = LogSource.objects.get(pk=pk, tenant=get_tenant(request.user))
        except LogSource.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        plain_key = generate_secret_key()
        source.secret_key = hash_secret(plain_key)
        source.secret_prefix = plain_key[:8]
        source.save(update_fields=["secret_key", "secret_prefix", "updated_at"])
        return Response({
            "detail": "Key rotated. Store the new key — it will not be shown again.",
            "plain_secret_key": plain_key,
            "secret_prefix": source.secret_prefix,
        })


# ---------------------------------------------------------------------------
# Event ingestion
# ---------------------------------------------------------------------------

class EventIngestView(APIView):
    """Accept events via source key authentication (X-Source-Key header)."""
    permission_classes = []
    authentication_classes = []

    def resolve_source(self, request, *, lock=False):
        raw_key = request.headers.get("X-Source-Key", "")
        if not raw_key:
            return None, Response({"detail": "X-Source-Key header required."}, status=401)
        sources = LogSource.objects.all()
        if lock:
            sources = sources.select_for_update(of=("self",))
        try:
            source = sources.get(secret_key=hash_secret(raw_key), enabled=True, tenant__status="active")
        except LogSource.DoesNotExist:
            return None, Response({"detail": "Invalid or disabled source key."}, status=401)

        expected_source = request.headers.get("X-Expected-Source-Id")
        session_user = get_user(request._request)
        if ((expected_source is not None and expected_source != str(source.pk))
                or (session_user.is_authenticated and session_user.tenant_id != source.tenant_id)):
            return None, Response({"detail": "Source does not match this request."}, status=403)
        return source, None

    @staticmethod
    def windows_asset_is_valid(source):
        return (source.source_type == "windows_event" and source.asset_id
                and source.asset.tenant_id == source.tenant_id and source.asset.hostname.strip())

    @extend_schema(
        parameters=[
            OpenApiParameter("X-Source-Key", str, OpenApiParameter.HEADER, required=True),
            OpenApiParameter("X-Expected-Source-Id", int, OpenApiParameter.HEADER, required=True),
        ],
        responses={204: None, 400: None, 401: None, 403: None},
        description="Check Windows collector source authorization without creating an event.",
    )
    def head(self, request):
        if request.headers.get("X-Expected-Source-Id") is None:
            return Response(status=400)
        source, error = self.resolve_source(request)
        if error is not None:
            return error
        if not self.windows_asset_is_valid(source):
            return Response(status=400)
        return Response(status=204)

    @extend_schema(
        request=EventIngestSerializer,
        parameters=[
            OpenApiParameter("X-Source-Key", str, OpenApiParameter.HEADER, required=True),
            OpenApiParameter("X-Expected-Source-Id", int, OpenApiParameter.HEADER),
        ],
        responses={201: EventSerializer, 200: inline_serializer(
            name="IngestReplay", fields={"id": serializers.IntegerField(), "deduplicated": serializers.BooleanField()},
        )},
    )
    @transaction.atomic
    def post(self, request):
        source, error = self.resolve_source(request, lock=True)
        if error is not None:
            return error
        serializer = EventIngestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        external_id = data.get("external_event_id", "")
        is_windows = data["event_type"].startswith("windows.")
        if is_windows:
            if not self.windows_asset_is_valid(source):
                return Response({"detail": "Windows events require a registered Windows Event Log source with an asset."}, status=400)
            if request.headers.get("X-Expected-Source-Id") is None:
                return Response({"detail": "X-Expected-Source-Id is required for Windows events."}, status=400)
            metadata = data["metadata"]
            computer = metadata.get("computer")
            channel = metadata.get("channel")
            event_id = metadata.get("event_id")
            level = metadata.get("level")
            if (not external_id or not isinstance(computer, str) or channel not in ("System", "Application")
                    or type(event_id) is not int or event_id < 0 or data["event_type"] != f"windows.{channel.lower()}.{event_id}"
                    or type(metadata.get("record_id")) is not int or metadata["record_id"] < 1
                    or (level is not None and type(level) is not int) or not isinstance(metadata.get("provider"), str)
                    or not metadata["provider"].strip() or "occurred_at" not in data):
                return Response({"detail": "Windows event identity, timestamp, or metadata is invalid."}, status=400)
            observed = computer.strip().rstrip(".").casefold()
            registered = source.asset.hostname.strip().rstrip(".").casefold()
            short_match = (
                ("." not in registered or "." not in observed)
                and observed.split(".")[0] == registered.split(".")[0]
            )
            if not observed or (observed != registered and not short_match):
                return Response({"detail": "Windows computer name does not match the linked asset hostname."}, status=400)
        payload_hash = hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()
        if external_id:
            existing = Event.objects.filter(source=source, external_event_id=external_id).first()
            if existing:
                existing_metadata = existing.metadata
                if (is_windows and data["metadata"].get("level") is None
                        and data["metadata"].get("record_id") == existing_metadata.get("record_id")
                        and existing_metadata.get("level") == 0):
                    # Older collectors encoded an absent Windows level as zero.
                    existing_metadata = {**existing_metadata, "level": None}
                same_payload = existing.payload_hash == payload_hash or (
                    existing.event_type == data["event_type"]
                    and existing.severity == data["severity"]
                    and existing.message == data["message"]
                    and existing.source_ip == data.get("source_ip")
                    and existing_metadata == data["metadata"]
                    and ("occurred_at" not in data or existing.occurred_at == data["occurred_at"])
                )
                if not same_payload:
                    return Response({"detail": "This event ID already has a different payload."}, status=409)
                return Response({"id": existing.pk, "deduplicated": True})

        event = Event.objects.create(
            tenant=source.tenant,
            source=source,
            external_event_id=data.get("external_event_id", ""),
            event_type=data["event_type"],
            severity=data.get("severity", "info"),
            message=data["message"],
            source_ip=data.get("source_ip"),
            metadata=data.get("metadata", {}),
            payload_hash=payload_hash,
            occurred_at=data.get("occurred_at") or timezone.now(),
        )
        # Update last_seen
        source.last_seen = timezone.now()
        source.save(update_fields=["last_seen"])

        return Response(EventSerializer(event).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Simulator
# ---------------------------------------------------------------------------

SAMPLE_EVENTS = {
    "login_failed": ("high", "Simulated failed logins", {"failed_attempts": 7}),
    "privilege_escalation": ("critical", "Simulated privilege change", {}),
    "data_transfer": ("high", "Simulated outbound transfer", {"bytes": 5583457280}),
    "network_scan": ("low", "Simulated network scan detection", {}),
    "login_success": ("info", "Simulated successful login", {}),
}


class SimulatorView(APIView):
    permission_classes = [IsSOCAnalyst]

    @extend_schema(request=SimulatorSerializer, responses={201: inline_serializer(
        name="SimulatorResult", fields={
            "detail": serializers.CharField(),
            "created": serializers.IntegerField(),
            "event_ids": serializers.ListField(child=serializers.IntegerField()),
            "alerts_created": serializers.IntegerField(),
        },
    )})
    @transaction.atomic
    def post(self, request):
        serializer = SimulatorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        tenant = get_tenant(request.user)
        sources = LogSource.objects.select_for_update().filter(tenant=tenant, enabled=True)
        if data.get("source_id"):
            sources = sources.filter(pk=data["source_id"])
        source = sources.first()
        if source is None:
            return Response({"detail": "Choose an enabled log source in your organization.", "code": "source_unavailable"}, status=400)

        event_type = data.get("event_type", "login_failed")
        default_severity, message, metadata = SAMPLE_EVENTS.get(
            event_type, ("info", f"Simulated {event_type} event", {}),
        )
        now = timezone.now()
        events = [
            Event.objects.create(
                tenant=tenant, source=source, event_type=event_type,
                severity=data.get("severity", default_severity), message=message,
                metadata=metadata, occurred_at=now,
            )
            for _ in range(data["count"])
        ]
        source.last_seen = now
        source.save(update_fields=["last_seen"])
        return Response({
            "detail": f"{len(events)} event(s) simulated.",
            "created": len(events),
            "event_ids": [event.pk for event in events],
            "alerts_created": Alert.objects.filter(event__in=events).count(),
        }, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Event list/detail
# ---------------------------------------------------------------------------

def tenant_events_with_risk(tenant):
    from django.db.models import Case, CharField, F, IntegerField, OuterRef, Subquery, Value, When
    from django.db.models.functions import Coalesce

    alerts = Alert.objects.filter(
        event_id=OuterRef("pk"), tenant_id=OuterRef("tenant_id"),
    ).exclude(status="dismissed").annotate(rank=Case(
        When(severity="critical", then=Value(4)),
        When(severity="high", then=Value(3)),
        When(severity="medium", then=Value(2)),
        When(severity="low", then=Value(1)),
        default=Value(0), output_field=IntegerField(),
    )).order_by("-rank", "pk")
    return Event.objects.select_related("source").filter(tenant=tenant).annotate(
        classified_risk=Coalesce(Subquery(alerts.values("severity")[:1]), "reviewed_risk"),
    ).annotate(risk_severity=Coalesce(
        F("classified_risk"),
        Case(
            When(severity__in=("low", "medium", "high", "critical"), then=F("severity")),
            default=Value("low"),
            output_field=CharField(),
        ),
    ))


class EventListView(generics.ListAPIView):
    permission_classes = [IsSOCAnalyst]
    serializer_class = EventSerializer
    search_fields = ["event_type", "message", "source_ip"]
    ordering_fields = ["occurred_at", "received_at", "severity"]
    ordering = ["-received_at"]

    def get_queryset(self):
        qs = tenant_events_with_risk(get_tenant(self.request.user))
        severity = self.request.query_params.get("severity")
        if severity:
            qs = qs.filter(severity=severity)
        event_type = self.request.query_params.get("event_type")
        if event_type:
            qs = qs.filter(event_type=event_type)
        risk = self.request.query_params.get("risk")
        if risk == "none":
            qs = qs.filter(classified_risk__isnull=True)
        elif risk:
            qs = qs.filter(risk_severity=risk)
        return qs


class EventDetailView(generics.RetrieveAPIView):
    permission_classes = [IsSOCAnalyst]
    serializer_class = EventSerializer

    def get_queryset(self):
        return tenant_events_with_risk(get_tenant(self.request.user))


# ---------------------------------------------------------------------------
# Rule views
# ---------------------------------------------------------------------------

class RuleListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsTenantLead]
    serializer_class = RuleSerializer
    search_fields = ["name", "event_type"]
    ordering_fields = ["name", "severity", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        qs = Rule.objects.filter(tenant=get_tenant(self.request.user))
        enabled = self.request.query_params.get("enabled")
        if enabled is not None:
            qs = qs.filter(enabled=enabled.lower() == "true")
        return qs

    def perform_create(self, serializer):
        serializer.save(tenant=require_tenant(self.request.user))


class RuleDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsTenantLead]
    serializer_class = RuleSerializer

    def get_queryset(self):
        return Rule.objects.filter(tenant=get_tenant(self.request.user))


class RuleEnableView(APIView):
    permission_classes = [IsTenantLead]

    @extend_schema(request=None, responses=RuleSerializer)
    def post(self, request, pk):
        try:
            rule = Rule.objects.get(pk=pk, tenant=get_tenant(request.user))
        except Rule.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        rule.enabled = True
        rule.save(update_fields=["enabled", "updated_at"])
        return Response(RuleSerializer(rule).data)


class RuleDisableView(APIView):
    permission_classes = [IsTenantLead]

    @extend_schema(request=None, responses=RuleSerializer)
    def post(self, request, pk):
        try:
            rule = Rule.objects.get(pk=pk, tenant=get_tenant(request.user))
        except Rule.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        rule.enabled = False
        rule.save(update_fields=["enabled", "updated_at"])
        return Response(RuleSerializer(rule).data)


# ---------------------------------------------------------------------------
# Alert views
# ---------------------------------------------------------------------------

class AlertListView(generics.ListAPIView):
    permission_classes = [IsSOCAnalyst]
    serializer_class = AlertSerializer
    search_fields = ["title", "rule__name", "assignee__full_name"]
    ordering_fields = ["created_at", "severity", "status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = Alert.objects.select_related("event", "rule", "assignee", "incident").filter(
            tenant=get_tenant(self.request.user)
        )
        for param in ("status", "severity"):
            val = self.request.query_params.get(param)
            if val:
                qs = qs.filter(**{param: val})
        assignee = self.request.query_params.get("assignee")
        if assignee == "me":
            qs = qs.filter(assignee=self.request.user)
        elif assignee:
            qs = qs.filter(assignee_id=assignee)
        return qs


class AlertDetailView(generics.RetrieveAPIView):
    permission_classes = [IsSOCAnalyst]
    serializer_class = AlertSerializer

    def get_queryset(self):
        return Alert.objects.select_related("event", "rule", "assignee", "incident").filter(
            tenant=get_tenant(self.request.user)
        )


class AlertClaimView(APIView):
    permission_classes = [IsIncidentResponder]

    @extend_schema(request=None, responses=AlertSerializer)
    @transaction.atomic
    def post(self, request, pk):
        try:
            alert = Alert.objects.select_for_update().get(pk=pk, tenant=get_tenant(request.user))
        except Alert.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if alert.status not in ("new", "in_review"):
            return Response({"detail": "This alert can no longer be claimed.", "code": "alert_claim_unavailable"}, status=status.HTTP_400_BAD_REQUEST)
        if alert.assignee_id not in (None, request.user.pk) and request.user.role != "soc_lead":
            return Response({"detail": "An analyst already claimed this alert.", "code": "alert_claimed"}, status=409)
        alert.assignee = request.user
        alert.status = "in_review"
        alert.save(update_fields=["assignee", "status", "updated_at"])
        return Response(AlertSerializer(alert).data)


class AlertTriageView(APIView):
    permission_classes = [IsIncidentResponder]

    @extend_schema(request=AlertTriageSerializer, responses=AlertSerializer)
    @transaction.atomic
    def post(self, request, pk):
        try:
            alert = Alert.objects.select_for_update().get(pk=pk, tenant=get_tenant(request.user))
        except Alert.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if alert.status not in ("new", "in_review"):
            return Response({"detail": "This alert is no longer awaiting triage.", "code": "alert_triage_unavailable"}, status=400)
        serializer = AlertTriageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get("severity"):
            alert.severity = serializer.validated_data["severity"]
        if serializer.validated_data.get("notes") is not None:
            alert.triage_notes = serializer.validated_data["notes"]
        if alert.status == "new":
            alert.status = "in_review"
        alert.save()
        return Response(AlertSerializer(alert).data)


class AlertDismissView(APIView):
    permission_classes = [IsIncidentResponder]

    @extend_schema(request=AlertDismissSerializer, responses=AlertSerializer)
    @transaction.atomic
    def post(self, request, pk):
        try:
            alert = Alert.objects.select_for_update().get(pk=pk, tenant=get_tenant(request.user))
        except Alert.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AlertDismissSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if alert.status in ("escalated", "resolved"):
            return Response({"detail": "This alert can no longer be dismissed.", "code": "alert_dismiss_unavailable"}, status=status.HTTP_400_BAD_REQUEST)
        alert.status = "dismissed"
        alert.dismissal_reason = serializer.validated_data["reason"]
        alert.save(update_fields=["status", "dismissal_reason", "updated_at"])
        return Response(AlertSerializer(alert).data)


class AlertEscalateView(APIView):
    permission_classes = [IsIncidentResponder]

    @extend_schema(request=AlertEscalateSerializer, responses={201: IncidentSerializer})
    @transaction.atomic
    def post(self, request, pk):
        from apps.incidents.models import Incident
        try:
            alert = Alert.objects.select_for_update().get(pk=pk, tenant=get_tenant(request.user))
        except Alert.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if alert.incident_id or alert.status not in ("new", "in_review"):
            return Response({"detail": "This alert cannot be escalated again or from its current status.", "code": "alert_escalation_unavailable"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = AlertEscalateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tenant = get_tenant(request.user)
        from uuid import uuid4
        from apps.incidents.models import TimelineEntry
        ref = f"INC-{timezone.now().year}-{uuid4().hex[:12].upper()}"

        incident = Incident.objects.create(
            tenant=tenant,
            reference=ref,
            title=serializer.validated_data.get("title") or alert.title,
            description=serializer.validated_data.get("description") or alert.triage_notes,
            severity=serializer.validated_data.get("severity") or alert.severity,
            status="open",
            owner=request.user,
            creator=request.user,
        )

        alert.incident = incident
        alert.status = "escalated"
        alert.save(update_fields=["incident", "status", "updated_at"])

        TimelineEntry.objects.create(incident=incident, tenant=tenant, actor=request.user,
            entry_type="alert_linked", message="Alert escalated into this incident.",
            metadata={"alert_id": alert.pk})
        return Response(IncidentSerializer(incident).data, status=status.HTTP_201_CREATED)
