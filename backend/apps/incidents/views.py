"""
Incidents views: Incident, Timeline, Evidence, Playbook, Action, Report, AuditLog.
"""
import logging
from pathlib import Path
from uuid import uuid4
from django.db import transaction
from drf_spectacular.utils import extend_schema, OpenApiTypes
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.parsers import MultiPartParser
from django.conf import settings
from django.http import FileResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsIncidentResponder, CanGenerateReport, CanManagePlaybooks
from apps.core.utils import sha256_file
from .models import Incident, TimelineEntry, Evidence, Playbook, PlaybookStep, Action, Report, AuditLog
from .reporting import report_analytics, report_metrics
from .report_exports import record_csv, report_csv, report_pdf
from .report_records import detailed_records
from .serializers import (
    IncidentSerializer, IncidentCreateSerializer, IncidentTransitionSerializer,
    TimelineEntrySerializer, EvidenceSerializer, EvidenceUploadSerializer,
    PlaybookSerializer, PlaybookStepSerializer,
    ActionSerializer, ActionTransitionSerializer, PlaybookApplicationSerializer,
    ReportSerializer, ReportCreateSerializer, ReportFiltersSerializer, ReportDownloadSerializer,
    ReportRecordListSerializer, ReportRecordDownloadSerializer,
)
from apps.core.serializers import AuditLogSerializer

logger = logging.getLogger(__name__)


def audit(request, obj, action, changes):
    AuditLog.objects.create(tenant=obj.tenant, actor=request.user, action=action,
                            entity_type=type(obj).__name__, entity_id=str(obj.pk), changes=changes,
                            request_id=getattr(request, "request_id", ""))


def require_open(incident):
    if incident.status in ("resolved", "closed"):
        raise ValidationError({"status": "This case is already resolved or closed."})


def get_tenant(user):
    return user.tenant


# ---------------------------------------------------------------------------
# Incident views
# ---------------------------------------------------------------------------

class IncidentListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsIncidentResponder]
    search_fields = ["title", "reference", "description", "owner__full_name"]
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
        if tenant is None:
            raise ValidationError({"tenant": "Use an organization account."})
        ref = f"INC-{timezone.now().year}-{uuid4().hex[:12].upper()}"
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
    permission_classes = [IsIncidentResponder]
    serializer_class = IncidentSerializer

    def get_queryset(self):
        return Incident.objects.select_related("owner", "creator", "closed_by").filter(
            tenant=get_tenant(self.request.user)
        )

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    def get_object(self):
        if self.request.method in ("PUT", "PATCH"):
            incident = generics.get_object_or_404(
                Incident.objects.select_for_update(), pk=self.kwargs["pk"], tenant=self.request.user.tenant,
            )
            require_open(incident)
            self.check_object_permissions(self.request, incident)
            return incident
        return super().get_object()

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return IncidentCreateSerializer
        return IncidentSerializer


class IncidentTransitionView(APIView):
    permission_classes = [IsIncidentResponder]

    @extend_schema(request=IncidentTransitionSerializer, responses=IncidentSerializer)
    @transaction.atomic
    def post(self, request, pk):
        incident = generics.get_object_or_404(
            Incident.objects.select_for_update(), pk=pk, tenant=get_tenant(request.user),
        )
        serializer = IncidentTransitionSerializer(data=request.data, context={"incident": incident})
        if (request.data.get("new_status") or request.data.get("status")) == "closed" and request.user.role != "soc_lead":
            raise PermissionDenied("Only the SOC Lead can close an incident.")
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["new_status"]
        incident.status = new_status
        if new_status == "resolved":
            incident.resolution_summary = serializer.validated_data["resolution_summary"]
            incident.resolved_at = timezone.now()
        if new_status == "closed":
            incident.closed_at = timezone.now()
            incident.closed_by = request.user
        incident.save()
        if new_status == "closed":
            for alert in incident.alerts.select_for_update().filter(tenant=incident.tenant):
                alert.status = "resolved"
                alert.save(update_fields=["status", "updated_at"])
        return Response(IncidentSerializer(incident).data)


class IncidentLinkedAlertsView(generics.ListAPIView):
    from apps.monitoring.serializers import AlertSerializer as serializer_class
    permission_classes = [IsIncidentResponder]

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
    permission_classes = [IsIncidentResponder]
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
        entry = serializer.save(
            incident=incident,
            tenant=incident.tenant,
            actor=self.request.user,
            entry_type="note",
        )
        audit(self.request, incident, "incident.note_added", {"entry_id": entry.pk})


# ---------------------------------------------------------------------------
# Evidence
# ---------------------------------------------------------------------------

class CanAccessEvidence(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ("soc_analyst", "soc_lead")


class IncidentEvidenceView(generics.ListAPIView):
    parser_classes = [MultiPartParser]
    permission_classes = [CanAccessEvidence]
    serializer_class = EvidenceSerializer

    def get_queryset(self):
        return Evidence.objects.select_related("uploader").filter(
            incident_id=self.kwargs["pk"],
            tenant=get_tenant(self.request.user),
        )

    @extend_schema(request=EvidenceUploadSerializer, responses={201: EvidenceSerializer})
    @transaction.atomic
    def post(self, request, pk):
        incident = generics.get_object_or_404(Incident.objects.select_for_update(), pk=pk, tenant=request.user.tenant)
        require_open(incident)
        serializer = EvidenceUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        file = serializer.validated_data["file"]
        description = serializer.validated_data.get("description", "")
        sha256 = sha256_file(file)
        file.seek(0)
        root = Path(settings.EVIDENCE_ROOT)
        root.mkdir(parents=True, exist_ok=True)
        stored_path = root / uuid4().hex
        try:
            with stored_path.open("xb") as dest:
                for chunk in file.chunks():
                    dest.write(chunk)

            evidence = Evidence.objects.create(
                incident=incident,
                tenant=incident.tenant,
                uploader=request.user,
                original_filename=file.name,
                stored_path=str(stored_path),
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

            audit(request, incident, "incident.evidence_added", {"evidence_id": evidence.pk})
        except Exception:
            stored_path.unlink(missing_ok=True)
            raise

        return Response(EvidenceSerializer(evidence).data, status=status.HTTP_201_CREATED)


class EvidenceDownloadView(APIView):
    permission_classes = [CanAccessEvidence]

    @extend_schema(responses={(200, "application/octet-stream"): OpenApiTypes.BINARY})
    def get(self, request, pk, eid):
        try:
            incident = Incident.objects.get(pk=pk, tenant=get_tenant(request.user))
            evidence = Evidence.objects.get(pk=eid, incident=incident, tenant=incident.tenant)
        except (Incident.DoesNotExist, Evidence.DoesNotExist):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        path = Path(evidence.stored_path).resolve()
        roots = (Path(settings.EVIDENCE_ROOT).resolve(), (Path(settings.MEDIA_ROOT) / "evidence").resolve())
        if not any(path.is_relative_to(root) for root in roots) or not path.is_file():
            return Response({"detail": "File not found on disk."}, status=status.HTTP_404_NOT_FOUND)

        response = FileResponse(
            path.open("rb"),
            content_type="application/octet-stream",
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
        qs = Playbook.objects.prefetch_related("steps").filter(tenant=get_tenant(self.request.user))
        enabled = self.request.query_params.get("enabled")
        return qs.filter(enabled=enabled.lower() == "true") if enabled else qs

    def perform_create(self, serializer):
        if self.request.user.tenant_id is None:
            raise ValidationError({"tenant": "Use an organization account."})
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

    @transaction.atomic
    def perform_create(self, serializer):
        playbook = generics.get_object_or_404(
            Playbook.objects.select_for_update(), pk=self.kwargs["pk"], tenant=self.request.user.tenant,
        )
        position = serializer.validated_data["position"]
        if playbook.steps.filter(position=position).exists():
            raise ValidationError({"position": "This position is already in use."})
        step = serializer.save(playbook=playbook)
        audit(self.request, playbook, "playbook.step_created", {"step_id": step.pk, "position": position})


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


    @transaction.atomic
    def perform_update(self, serializer):
        step = serializer.instance
        playbook = Playbook.objects.select_for_update().get(pk=step.playbook_id)
        position = serializer.validated_data.get("position", step.position)
        if playbook.steps.filter(position=position).exclude(pk=step.pk).exists():
            raise ValidationError({"position": "This position is already in use."})
        serializer.save()
        audit(self.request, playbook, "playbook.step_updated", {"step_id": step.pk, "position": position})


# ---------------------------------------------------------------------------
# Apply playbook to incident
# ---------------------------------------------------------------------------

class IncidentApplyPlaybookView(APIView):
    permission_classes = [IsIncidentResponder]

    @extend_schema(request=PlaybookApplicationSerializer, responses=OpenApiTypes.OBJECT)
    @transaction.atomic
    def post(self, request, pk):
        if request.user.role != "soc_lead":
            raise PermissionDenied("Only the SOC Lead can apply playbooks.")
        incident = generics.get_object_or_404(Incident.objects.select_for_update(), pk=pk, tenant=request.user.tenant)
        require_open(incident)
        serializer = PlaybookApplicationSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        playbook = generics.get_object_or_404(Playbook.objects.select_for_update(), pk=data["playbook_id"], tenant=incident.tenant, enabled=True)
        steps = list(playbook.steps.all())
        if not steps:
            raise ValidationError({"playbook_id": "Add at least one step before applying the playbook."})
        if incident.timeline_entries.filter(entry_type="playbook_applied", metadata__playbook_id=playbook.pk).exists():
            return Response({"actions_created": 0, "action_ids": [], "detail": "Playbook already applied."})
        ids = []
        for step in steps:
            action, created = Action.objects.get_or_create(
                incident=incident, playbook_step=step,
                defaults={"tenant": incident.tenant, "title": step.title, "instructions": step.instructions,
                          "required": step.required, "assignee": data.get("assignee")},
            )
            if created:
                ids.append(action.pk)
        TimelineEntry.objects.create(incident=incident, tenant=incident.tenant, actor=request.user,
            entry_type="playbook_applied", message=f"Applied {playbook.name}.",
            metadata={"playbook_id": playbook.pk, "actions": ids})
        audit(request, incident, "incident.playbook_applied", {"playbook_id": playbook.pk, "actions": ids})
        return Response({"actions_created": len(ids), "action_ids": ids})


# ---------------------------------------------------------------------------
# Action (task) views
# ---------------------------------------------------------------------------

class IncidentActionListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsIncidentResponder]
    serializer_class = ActionSerializer

    def get_queryset(self):
        return Action.objects.select_related("assignee", "playbook_step").filter(
            incident_id=self.kwargs["pk"],
            tenant=get_tenant(self.request.user),
        )

    @transaction.atomic
    def perform_create(self, serializer):
        if self.request.user.role != "soc_lead":
            raise PermissionDenied("Only the SOC Lead can create tasks.")
        incident = generics.get_object_or_404(Incident.objects.select_for_update(), pk=self.kwargs["pk"], tenant=self.request.user.tenant)
        require_open(incident)
        action = serializer.save(tenant=incident.tenant, incident=incident)
        audit(self.request, incident, "incident.task_created", {"action_id": action.pk})


class ActionTransitionView(APIView):
    permission_classes = [IsIncidentResponder]

    @extend_schema(request=ActionTransitionSerializer, responses=ActionSerializer)
    @transaction.atomic
    def post(self, request, pk, aid):
        incident = generics.get_object_or_404(Incident.objects.select_for_update(), pk=pk, tenant=request.user.tenant)
        require_open(incident)
        action = generics.get_object_or_404(Action, pk=aid, incident=incident, tenant=incident.tenant)
        lead = request.user.role == "soc_lead"
        serializer = ActionTransitionSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "assignee" in data:
            if not lead:
                raise PermissionDenied("Only the SOC Lead can assign tasks.")
            if action.status not in ("pending", "in_progress"):
                raise ValidationError({"assignee": "Only open tasks can be reassigned."})
            action.assignee = data["assignee"]
        new_status = data.get("new_status")
        if new_status:
            if not lead and (request.user.role != "soc_analyst" or action.assignee_id not in (None, request.user.pk)):
                raise PermissionDenied("Only the assignee or SOC Lead can update this task.")
            allowed = {"pending": {"in_progress", "completed", "skipped"}, "in_progress": {"completed", "skipped"}}
            if new_status not in allowed.get(action.status, set()):
                raise ValidationError({"status": "This task transition is not available."})
            if new_status == "skipped" and (action.required or not lead):
                raise ValidationError({"status": "Only the SOC Lead can skip optional tasks."})
            if new_status in ("completed", "skipped") and not data.get("completion_notes"):
                raise ValidationError({"completion_notes": "Enter a completion note or skip reason."})
            action.status = new_status
            if new_status in ("completed", "skipped"):
                action.completed_at = timezone.now()
                action.completed_by = request.user
                action.completion_notes = data["completion_notes"]
        action.save()
        changes = {"action_id": action.pk, "status": action.status, "assignee_id": action.assignee_id}
        TimelineEntry.objects.create(incident=incident, tenant=incident.tenant, actor=request.user,
            entry_type="task_updated", message=f"Task '{action.title}' updated.", metadata=changes)
        audit(request, incident, "incident.task_updated", changes)
        return Response(ActionSerializer(action).data)


# ---------------------------------------------------------------------------
# Report views
# ---------------------------------------------------------------------------

def report_scope(user, data):
    tenant = get_tenant(user)
    if tenant is None or data.get("tenant", tenant.pk) != tenant.pk:
        raise PermissionDenied("You can only access reports for your organization.")
    return tenant


def filtered_report(tenant, data):
    return report_analytics(
        tenant, data["period_start"], data["period_end"],
        data.get("report_type", "overview"), data.get("severity", ""), data.get("status", ""),
    )


class ReportAnalyticsView(APIView):
    permission_classes = [CanGenerateReport]

    @extend_schema(parameters=[ReportFiltersSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        serializer = ReportFiltersSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        return Response(filtered_report(report_scope(request.user, data), data))


class ReportExportView(APIView):
    permission_classes = [CanGenerateReport]

    @extend_schema(parameters=[ReportDownloadSerializer], responses={
        (200, "application/pdf"): OpenApiTypes.BINARY,
        (200, "text/csv"): OpenApiTypes.BINARY,
    })
    def get(self, request):
        serializer = ReportDownloadSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        report = filtered_report(report_scope(request.user, data), data)
        return report_pdf(report) if data["export"] == "pdf" else report_csv(report)


class ReportRecordsView(APIView):
    permission_classes = [CanGenerateReport]

    @extend_schema(parameters=[ReportRecordListSerializer], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        serializer = ReportRecordListSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        filters = serializer.validated_data
        records = detailed_records(report_scope(request.user, filters), filters)
        page_size = 25
        start = (filters["page"] - 1) * page_size
        return Response({"count": records.count(), "results": list(records[start:start + page_size])})


class ReportRecordExportView(APIView):
    permission_classes = [CanGenerateReport]

    @extend_schema(parameters=[ReportRecordDownloadSerializer], responses={
        (200, "application/pdf"): OpenApiTypes.BINARY,
        (200, "text/csv"): OpenApiTypes.BINARY,
    })
    def get(self, request):
        serializer = ReportRecordDownloadSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        filters = serializer.validated_data
        tenant = report_scope(request.user, filters)
        records = detailed_records(tenant, filters)
        if filters["export"] == "csv":
            return record_csv(records.iterator())
        limit = 1000
        rows = list(records[:limit + 1])
        if len(rows) > limit:
            raise ValidationError({"export": "PDF exports support up to 1,000 records. Narrow the filters or use CSV."})
        return report_pdf({"tenant": {"name": tenant.name}, "filters": filters}, records=rows)


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
        serializer = ReportCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        tenant = report_scope(request.user, data)

        period_start = data["period_start"]
        period_end = data["period_end"]

        metrics = ({"analytics": filtered_report(tenant, data)} if any(key in data for key in ("report_type", "severity", "status"))
                   else report_metrics(tenant, period_start, period_end))

        report = Report.objects.create(
            tenant=tenant,
            title=data["title"],
            period_start=period_start,
            period_end=period_end,
            metrics=metrics,
            generated_by=request.user,
        )
        audit(request, report, "report.generated", {})
        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)


class ReportDetailView(generics.RetrieveAPIView):
    permission_classes = [CanGenerateReport]
    serializer_class = ReportSerializer

    def get_queryset(self):
        return Report.objects.select_related("generated_by").filter(
            tenant=get_tenant(self.request.user)
        )
