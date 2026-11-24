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
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsSOCLead, IsCustomerAdmin, IsSOCAnalyst
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
        return [IsAuthenticated()] if self.request.method in SAFE_METHODS else [IsCustomerAdmin()]
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
        return [IsAuthenticated()] if self.request.method in SAFE_METHODS else [IsCustomerAdmin()]

    def get_queryset(self):
        return Asset.objects.filter(tenant=get_tenant(self.request.user))


# ---------------------------------------------------------------------------
# LogSource views
# ---------------------------------------------------------------------------

class LogSourceListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsCustomerAdmin]
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
    permission_classes = [IsCustomerAdmin]
    serializer_class = LogSourceSerializer

    def get_queryset(self):
        return LogSource.objects.select_related("asset").filter(
            tenant=get_tenant(self.request.user)
        )


class LogSourceRotateKeyView(APIView):
    permission_classes = [IsCustomerAdmin]

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

    @extend_schema(
        request=EventIngestSerializer,
        parameters=[OpenApiParameter("X-Source-Key", str, OpenApiParameter.HEADER, required=True)],
        responses={201: EventSerializer, 200: inline_serializer(
            name="IngestReplay", fields={"id": serializers.IntegerField(), "deduplicated": serializers.BooleanField()},
        )},
    )
    @transaction.atomic
    def post(self, request):
        raw_key = request.headers.get("X-Source-Key", "")
        if not raw_key:
            return Response({"detail": "X-Source-Key header required."}, status=status.HTTP_401_UNAUTHORIZED)

        hashed = hash_secret(raw_key)
        try:
            source = LogSource.objects.select_for_update(of=("self",)).get(
                secret_key=hashed, enabled=True, tenant__status="active",
            )
        except LogSource.DoesNotExist:
            return Response({"detail": "Invalid or disabled source key."}, status=status.HTTP_401_UNAUTHORIZED)

        session_user = get_user(request._request)
        if session_user.is_authenticated and session_user.tenant_id != source.tenant_id:
            return Response({"detail": "Source does not belong to your organization."}, status=403)
        serializer = EventIngestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        external_id = data.get("external_event_id", "")
        payload_hash = hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()
        if external_id:
            existing = Event.objects.filter(source=source, external_event_id=external_id).first()
            if existing:
                same_payload = existing.payload_hash == payload_hash or (
                    existing.event_type == data["event_type"]
                    and existing.severity == data["severity"]
                    and existing.message == data["message"]
                    and existing.source_ip == data.get("source_ip")
                    and existing.metadata == data["metadata"]
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
    permission_classes = [IsAuthenticated]

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
            return Response({"detail": "Choose an enabled log source in your organization."}, status=400)

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

class EventListView(generics.ListAPIView):
    permission_classes = [IsSOCAnalyst]
    serializer_class = EventSerializer
    search_fields = ["event_type", "message", "source_ip"]
    ordering_fields = ["occurred_at", "received_at", "severity"]
    ordering = ["-received_at"]

    def get_queryset(self):
        qs = Event.objects.select_related("source").filter(tenant=get_tenant(self.request.user))
        severity = self.request.query_params.get("severity")
        if severity:
            qs = qs.filter(severity=severity)
        event_type = self.request.query_params.get("event_type")
        if event_type:
            qs = qs.filter(event_type=event_type)
        return qs


class EventDetailView(generics.RetrieveAPIView):
    permission_classes = [IsSOCAnalyst]
    serializer_class = EventSerializer

    def get_queryset(self):
        return Event.objects.select_related("source").filter(tenant=get_tenant(self.request.user))


# ---------------------------------------------------------------------------
# Rule views
# ---------------------------------------------------------------------------

class RuleListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsSOCLead]
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
    permission_classes = [IsSOCLead]
    serializer_class = RuleSerializer

    def get_queryset(self):
        return Rule.objects.filter(tenant=get_tenant(self.request.user))


class RuleEnableView(APIView):
    permission_classes = [IsSOCLead]

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
    permission_classes = [IsSOCLead]

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
    permission_classes = [IsSOCAnalyst]

    @extend_schema(request=None, responses=AlertSerializer)
    def post(self, request, pk):
        try:
            alert = Alert.objects.get(pk=pk, tenant=get_tenant(request.user))
        except Alert.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if alert.status not in ("new", "in_review"):
            return Response({"detail": f"Cannot claim alert with status '{alert.status}'."}, status=status.HTTP_400_BAD_REQUEST)
        alert.assignee = request.user
        alert.status = "in_review"
        alert.save(update_fields=["assignee", "status", "updated_at"])
        return Response(AlertSerializer(alert).data)


class AlertTriageView(APIView):
    permission_classes = [IsSOCAnalyst]

    @extend_schema(request=AlertTriageSerializer, responses=AlertSerializer)
    def post(self, request, pk):
        try:
            alert = Alert.objects.get(pk=pk, tenant=get_tenant(request.user))
        except Alert.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
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
    permission_classes = [IsSOCLead]

    @extend_schema(request=AlertDismissSerializer, responses=AlertSerializer)
    def post(self, request, pk):
        try:
            alert = Alert.objects.get(pk=pk, tenant=get_tenant(request.user))
        except Alert.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AlertDismissSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if alert.status in ("escalated", "resolved"):
            return Response({"detail": f"Cannot dismiss alert with status '{alert.status}'."}, status=status.HTTP_400_BAD_REQUEST)
        alert.status = "dismissed"
        alert.dismissal_reason = serializer.validated_data["reason"]
        alert.save(update_fields=["status", "dismissal_reason", "updated_at"])
        return Response(AlertSerializer(alert).data)


class AlertEscalateView(APIView):
    permission_classes = [IsSOCAnalyst]

    @extend_schema(request=AlertEscalateSerializer, responses={201: IncidentSerializer})
    def post(self, request, pk):
        from apps.incidents.models import Incident
        try:
            alert = Alert.objects.select_related("event", "rule").get(pk=pk, tenant=get_tenant(request.user))
        except Alert.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if alert.status == "escalated" and alert.incident_id:
            return Response({"detail": "Alert is already escalated to an incident."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = AlertEscalateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tenant = get_tenant(request.user)
        last_ref = Incident.objects.filter(tenant=tenant).order_by("-id").first()
        year = timezone.now().year
        seq = (last_ref.id if last_ref else 0) + 1
        ref = f"INC-{year}-{seq:04d}"

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

        return Response(IncidentSerializer(incident).data, status=status.HTTP_201_CREATED)
