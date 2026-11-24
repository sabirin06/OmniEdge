"""
Incidents views: Incident, Timeline, Evidence, Playbook, Action, Report, AuditLog.
"""
import logging
import os
from django.conf import settings
from django.db.models import Avg, Count, Q
from django.http import FileResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsSOCAnalyst, IsSOCLead, IsCustomerAdmin, CanGenerateReport, CanManagePlaybooks
from apps.core.utils import sha256_file
from .models import Incident, TimelineEntry, Evidence, Playbook, PlaybookStep, Action, Report, AuditLog
from .serializers import (
    IncidentSerializer, IncidentCreateSerializer, IncidentTransitionSerializer,
    TimelineEntrySerializer, EvidenceSerializer, EvidenceUploadSerializer,
    PlaybookSerializer, PlaybookStepSerializer,
    ActionSerializer, ActionTransitionSerializer,
    ReportSerializer, ReportCreateSerializer,
)
from apps.core.serializers import AuditLogSerializer

logger = logging.getLogger(__name__)


def get_tenant(user):
    return user.tenant


# ---------------------------------------------------------------------------
# Incident views
# ---------------------------------------------------------------------------

class IncidentListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsSOCAnalyst]
    search_fields = ["title", "reference", "description"]
    ordering_fields = ["created_at", "severity", "status"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return IncidentCreateSerializer
        return IncidentSerializer

    def get_queryset(self):
        qs = Incident.objects.select_related("owner", "creator").filter(
            tenant=get_tenant(self.request.user)
        )
        for param in ("status", "severity"):
            val = self.request.query_params.get(param)
            if val:
                qs = qs.filter(**{param: val})
        owner = self.request.query_params.get("owner")
        if owner == "me":
            qs = qs.filter(owner=self.request.user)
        return qs

    def perform_create(self, serializer):
        tenant = get_tenant(self.request.user)
        last = Incident.objects.filter(tenant=tenant).order_by("-id").first()
        year = timezone.now().year
        seq = (last.id if last else 0) + 1
        ref = f"INC-{year}-{seq:04d}"
        serializer.save(
            tenant=tenant,
            creator=self.request.user,
            reference=ref,
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # Return full incident data
        instance = Incident.objects.select_related("owner", "creator").get(
            reference=serializer.instance.reference
        )
        return Response(IncidentSerializer(instance).data, status=status.HTTP_201_CREATED)


class IncidentDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsSOCAnalyst]
    serializer_class = IncidentSerializer

    def get_queryset(self):
        return Incident.objects.select_related("owner", "creator", "closed_by").filter(
            tenant=get_tenant(self.request.user)
        )

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return IncidentCreateSerializer
        return IncidentSerializer


class IncidentTransitionView(APIView):
    permission_classes = [IsSOCAnalyst]

    def post(self, request, pk):
        try:
            incident = Incident.objects.get(pk=pk, tenant=get_tenant(request.user))
        except Incident.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        # Only SOC Lead+ can close
        new_status = request.data.get("new_status")
        if new_status == "closed" and request.user.role not in ("soc_lead", "customer_admin", "platform_admin"):
            return Response({"detail": "Only SOC Lead or above can close an incident."}, status=status.HTTP_403_FORBIDDEN)

        serializer = IncidentTransitionSerializer(
            data=request.data, context={"incident": incident}
        )
        serializer.is_valid(raise_exception=True)

        old_status = incident.status
        incident.status = serializer.validated_data["new_status"]
        if serializer.validated_data.get("resolution_summary"):
            incident.resolution_summary = serializer.validated_data["resolution_summary"]
        if incident.status == "resolved" and not incident.resolved_at:
            incident.resolved_at = timezone.now()
        if incident.status == "closed":
            incident.closed_at = timezone.now()
            incident.closed_by = request.user
        incident.save()

        return Response(IncidentSerializer(incident).data)


class IncidentLinkedAlertsView(generics.ListAPIView):
    permission_classes = [IsSOCAnalyst]

    def get_queryset(self):
        from apps.monitoring.models import Alert
        try:
            incident = Incident.objects.get(pk=self.kwargs["pk"], tenant=get_tenant(self.request.user))
        except Incident.DoesNotExist:
            return Alert.objects.none()
        return Alert.objects.select_related("event", "rule").filter(incident=incident)

    def get(self, request, pk):
        from apps.monitoring.serializers import AlertSerializer
        alerts = self.get_queryset()
        return Response(AlertSerializer(alerts, many=True).data)


# ---------------------------------------------------------------------------
# Timeline
# ---------------------------------------------------------------------------

class IncidentTimelineView(generics.ListCreateAPIView):
    permission_classes = [IsSOCAnalyst]
    serializer_class = TimelineEntrySerializer

    def get_queryset(self):
        return TimelineEntry.objects.select_related("actor").filter(
            incident_id=self.kwargs["pk"],
            tenant=get_tenant(self.request.user),
        )

    def _get_incident(self):
        try:
            return Incident.objects.get(pk=self.kwargs["pk"], tenant=get_tenant(self.request.user))
        except Incident.DoesNotExist:
            return None

    def perform_create(self, serializer):
        incident = self._get_incident()
        if not incident:
            from rest_framework.exceptions import NotFound
            raise NotFound()
        serializer.save(
            incident=incident,
            tenant=incident.tenant,
            actor=self.request.user,
            entry_type="note",
        )


# ---------------------------------------------------------------------------
# Evidence
# ---------------------------------------------------------------------------

class IncidentEvidenceView(generics.ListAPIView):
    permission_classes = [IsSOCAnalyst]
    serializer_class = EvidenceSerializer

    def get_queryset(self):
        return Evidence.objects.select_related("uploader").filter(
            incident_id=self.kwargs["pk"],
            tenant=get_tenant(self.request.user),
        )

    def post(self, request, pk):
        try:
            incident = Incident.objects.get(pk=pk, tenant=get_tenant(request.user))
        except Incident.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        upload_serializer = EvidenceUploadSerializer(data=request.data)
        upload_serializer.is_valid(raise_exception=True)

        file = upload_serializer.validated_data["file"]
        description = upload_serializer.validated_data.get("description", "")

        # Compute SHA-256
        sha256 = sha256_file(file)

        # Build storage path
        tenant_dir = os.path.join(settings.MEDIA_ROOT, "evidence", str(incident.tenant_id), str(incident.pk))
        os.makedirs(tenant_dir, exist_ok=True)

        safe_name = f"{sha256[:16]}_{file.name}"
        stored_path = os.path.join(tenant_dir, safe_name)

        with open(stored_path, "wb+") as dest:
            for chunk in file.chunks():
                dest.write(chunk)

        evidence = Evidence.objects.create(
            incident=incident,
            tenant=incident.tenant,
            uploader=request.user,
            original_filename=file.name,
            stored_path=stored_path,
            file_type=file.content_type,
            file_size=file.size,
            sha256=sha256,
            description=description,
        )

        # Timeline entry
        TimelineEntry.objects.create(
            incident=incident,
            tenant=incident.tenant,
            actor=request.user,
            entry_type="evidence_added",
            message=f"Evidence '{file.name}' uploaded.",
            metadata={"evidence_id": evidence.id, "sha256": sha256},
        )

        return Response(EvidenceSerializer(evidence).data, status=status.HTTP_201_CREATED)


class EvidenceDownloadView(APIView):
    permission_classes = [IsSOCAnalyst]

    def get(self, request, pk, eid):
        try:
            incident = Incident.objects.get(pk=pk, tenant=get_tenant(request.user))
            evidence = Evidence.objects.get(pk=eid, incident=incident, tenant=incident.tenant)
        except (Incident.DoesNotExist, Evidence.DoesNotExist):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if not os.path.exists(evidence.stored_path):
            return Response({"detail": "File not found on disk."}, status=status.HTTP_404_NOT_FOUND)

        response = FileResponse(
            open(evidence.stored_path, "rb"),
            content_type=evidence.file_type,
            as_attachment=True,
            filename=evidence.original_filename,
        )
        return response


# ---------------------------------------------------------------------------
# Playbook views
# ---------------------------------------------------------------------------

class PlaybookListCreateView(generics.ListCreateAPIView):
    permission_classes = [CanManagePlaybooks]
    serializer_class = PlaybookSerializer
    search_fields = ["name", "category"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        return Playbook.objects.prefetch_related("steps").filter(
            tenant=get_tenant(self.request.user)
        )

    def perform_create(self, serializer):
        serializer.save(tenant=get_tenant(self.request.user))


class PlaybookDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [CanManagePlaybooks]
    serializer_class = PlaybookSerializer

    def get_queryset(self):
        return Playbook.objects.prefetch_related("steps").filter(
            tenant=get_tenant(self.request.user)
        )


class PlaybookStepListCreateView(generics.ListCreateAPIView):
    permission_classes = [CanManagePlaybooks]
    serializer_class = PlaybookStepSerializer

    def get_queryset(self):
        return PlaybookStep.objects.filter(
            playbook_id=self.kwargs["pk"],
            playbook__tenant=get_tenant(self.request.user),
        )

    def perform_create(self, serializer):
        try:
            playbook = Playbook.objects.get(pk=self.kwargs["pk"], tenant=get_tenant(self.request.user))
        except Playbook.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound()
        serializer.save(playbook=playbook)


class PlaybookStepDetailView(generics.UpdateAPIView):
    permission_classes = [CanManagePlaybooks]
    serializer_class = PlaybookStepSerializer

    def get_queryset(self):
        return PlaybookStep.objects.filter(
            playbook_id=self.kwargs["pk"],
            playbook__tenant=get_tenant(self.request.user),
        )

    def get_object(self):
        return generics.get_object_or_404(self.get_queryset(), pk=self.kwargs["sid"])


# ---------------------------------------------------------------------------
# Apply playbook to incident
# ---------------------------------------------------------------------------

class IncidentApplyPlaybookView(APIView):
    permission_classes = [IsSOCLead]

    def post(self, request, pk):
        try:
            incident = Incident.objects.get(pk=pk, tenant=get_tenant(request.user))
        except Incident.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        playbook_id = request.data.get("playbook_id")
        if not playbook_id:
            return Response({"detail": "playbook_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            playbook = Playbook.objects.prefetch_related("steps").get(
                pk=playbook_id, tenant=get_tenant(request.user), enabled=True
            )
        except Playbook.DoesNotExist:
            return Response({"detail": "Playbook not found or disabled."}, status=status.HTTP_404_NOT_FOUND)

        actions_created = []
        for step in playbook.steps.all():
            action = Action.objects.create(
                tenant=incident.tenant,
                incident=incident,
                playbook_step=step,
                title=step.title,
                instructions=step.instructions,
                required=step.required,
                status="pending",
            )
            actions_created.append(action.id)

        TimelineEntry.objects.create(
            incident=incident,
            tenant=incident.tenant,
            actor=request.user,
            entry_type="playbook_applied",
            message=f"Playbook '{playbook.name}' applied — {len(actions_created)} task(s) created.",
            metadata={"playbook_id": playbook.id, "actions": actions_created},
        )

        return Response({
            "detail": f"Playbook '{playbook.name}' applied.",
            "actions_created": len(actions_created),
            "action_ids": actions_created,
        })


# ---------------------------------------------------------------------------
# Action (task) views
# ---------------------------------------------------------------------------

class IncidentActionListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsSOCAnalyst]
    serializer_class = ActionSerializer

    def get_queryset(self):
        return Action.objects.select_related("assignee", "playbook_step").filter(
            incident_id=self.kwargs["pk"],
            tenant=get_tenant(self.request.user),
        )

    def perform_create(self, serializer):
        try:
            incident = Incident.objects.get(pk=self.kwargs["pk"], tenant=get_tenant(self.request.user))
        except Incident.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound()
        serializer.save(tenant=incident.tenant, incident=incident)


class ActionTransitionView(APIView):
    permission_classes = [IsSOCAnalyst]

    def post(self, request, pk, aid):
        try:
            incident = Incident.objects.get(pk=pk, tenant=get_tenant(request.user))
            action = Action.objects.get(pk=aid, incident=incident)
        except (Incident.DoesNotExist, Action.DoesNotExist):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ActionTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["new_status"]
        action.status = new_status
        if serializer.validated_data.get("completion_notes"):
            action.completion_notes = serializer.validated_data["completion_notes"]
        if new_status == "completed":
            action.completed_at = timezone.now()
            action.completed_by = request.user
        action.save()

        TimelineEntry.objects.create(
            incident=incident,
            tenant=incident.tenant,
            actor=request.user,
            entry_type="task_updated",
            message=f"Task '{action.title}' moved to '{new_status}'.",
            metadata={"action_id": action.id, "new_status": new_status},
        )

        return Response(ActionSerializer(action).data)


# ---------------------------------------------------------------------------
# Report views
# ---------------------------------------------------------------------------

class ReportListCreateView(generics.ListCreateAPIView):
    permission_classes = [CanGenerateReport]
    search_fields = ["title"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ReportCreateSerializer
        return ReportSerializer

    def get_queryset(self):
        return Report.objects.select_related("generated_by").filter(
            tenant=get_tenant(self.request.user)
        )

    def create(self, request, *args, **kwargs):
        from apps.monitoring.models import Event, Alert
        serializer = ReportCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        tenant = get_tenant(request.user)

        period_start = data["period_start"]
        period_end = data["period_end"]

        events_qs = Event.objects.filter(
            tenant=tenant,
            received_at__date__gte=period_start,
            received_at__date__lte=period_end,
        )
        alerts_qs = Alert.objects.filter(
            tenant=tenant,
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        )
        incidents_qs = Incident.objects.filter(
            tenant=tenant,
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        )

        # Event counts
        event_counts = {s: events_qs.filter(severity=s).count() for s in ["info", "low", "medium", "high", "critical"]}

        # Alert severity breakdown
        alert_severity = {s: alerts_qs.filter(severity=s).count() for s in ["low", "medium", "high", "critical"]}

        # Incident outcomes
        incident_outcomes = {s: incidents_qs.filter(status=s).count() for s in ["open", "investigating", "containment", "resolved", "closed"]}

        # Open workload
        open_alerts = Alert.objects.filter(tenant=tenant).exclude(status__in=["dismissed", "resolved"]).count()
        open_incidents = Incident.objects.filter(tenant=tenant).exclude(status__in=["resolved", "closed"]).count()

        metrics = {
            "period": {"start": str(period_start), "end": str(period_end)},
            "events": {"total": events_qs.count(), "by_severity": event_counts},
            "alerts": {"total": alerts_qs.count(), "by_severity": alert_severity},
            "incidents": {"total": incidents_qs.count(), "by_status": incident_outcomes},
            "open_workload": {"alerts": open_alerts, "incidents": open_incidents},
        }

        report = Report.objects.create(
            tenant=tenant,
            title=data["title"],
            period_start=period_start,
            period_end=period_end,
            metrics=metrics,
            generated_by=request.user,
        )
        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)


class ReportDetailView(generics.RetrieveAPIView):
    permission_classes = [CanGenerateReport]
    serializer_class = ReportSerializer

    def get_queryset(self):
        return Report.objects.select_related("generated_by").filter(
            tenant=get_tenant(self.request.user)
        )
