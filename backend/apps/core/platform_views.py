"""Platform control plane. Customer APIs retain their existing tenant checks."""
from datetime import timedelta
from time import perf_counter

from django.conf import settings as django_settings
from django.db import connection, transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema, OpenApiTypes
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.incidents.models import AuditLog, Incident, Playbook, Report
from apps.monitoring.models import Alert, Asset, Event, LogSource, Rule
from apps.monitoring.serializers import RuleSerializer
from .models import PlatformSetting, PlatformWorkItem, SupportSession, Tenant, User
from .permissions import IsPlatformAdmin
from rest_framework.permissions import IsAuthenticated


def audit_platform(request, action, obj=None, tenant=None, **changes):
    AuditLog.objects.create(
        actor=request.user, tenant=tenant, action=action,
        entity_type=type(obj).__name__ if obj is not None else "Platform",
        entity_id=str(obj.pk) if obj is not None else "",
        changes=changes, request_id=getattr(request, "request_id", ""),
    )


def platform_audit():
    return AuditLog.objects.filter(
        Q(actor__role="platform_admin") | Q(action__startswith="platform.") | Q(action__startswith="auth.")
    )


def health_status():
    start = perf_counter()
    linked = True
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:
        linked = False
    return {
        "database": "connected" if linked else "unavailable",
        "database_probe_ms": round((perf_counter() - start) * 1000, 2),
        "api": "responding",
        "last_event": Event.objects.order_by("-received_at").values_list("received_at", flat=True).first() if linked else None,
    }


def resources():
    users = User.objects.all()
    audit = platform_audit()
    return {
        "users": (users, ("id", "full_name", "email", "tenant__name", "role", "is_active", "suspended")),
        "active-users": (users.filter(is_active=True), ("id", "full_name", "email", "tenant__name", "role", "is_active")),
        "inactive-users": (users.filter(is_active=False), ("id", "full_name", "email", "tenant__name", "role", "suspended")),
        "tenants": (Tenant.objects.all(), ("id", "name", "code", "status", "created_at")),
        "events": (Event.objects.all(), ("id", "tenant__name", "severity", "received_at")),
        "alerts": (Alert.objects.all(), ("id", "tenant__name", "status", "severity", "created_at")),
        "incidents": (Incident.objects.all(), ("id", "tenant__name", "status", "severity", "created_at")),
        "log-sources": (LogSource.objects.all(), ("id", "tenant__name", "source_type", "enabled", "last_seen")),
        "failed-logins": (audit.filter(action="auth.login_failed"), ("id", "action", "timestamp")),
        "authentication": (audit.filter(action__startswith="auth."), ("id", "action", "actor__email", "tenant__name", "timestamp")),
        "audit": (audit, ("id", "action", "entity_type", "entity_id", "actor__email", "tenant__name", "timestamp")),
        "ticket": (PlatformWorkItem.objects.filter(kind="ticket"), ("id", "title", "status", "updated_at")),
    }


class PlatformView(APIView):
    permission_classes = [IsPlatformAdmin]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request, section="overview"):
        if section == "health":
            result = health_status()
            return Response(result, status=200 if result["database"] == "connected" else 503)
        datasets = resources()
        if section in ("overview", "reports"):
            data = {key: query.count() for key, (query, _) in datasets.items()}
            result = {
                "counts": data, "health": health_status(), "as_of": timezone.now(),
                "activity": list(platform_audit().order_by("-timestamp", "-pk")[:10].values("action", "timestamp")),
            }
            if section == "reports":
                audit_platform(request, "platform.report_generated")
            return Response(result)
        if section not in datasets:
            return Response({"detail": "Unknown platform section."}, status=404)
        try:
            page = int(request.query_params.get("page", 1))
        except ValueError:
            page = 0
        if not 1 <= page <= 100000:
            raise ValidationError({"page": "Choose a valid page number."})
        query, fields = datasets[section]
        offset = (page - 1) * 25
        return Response({
            "count": query.count(), "columns": fields,
            "results": list(query.order_by("-pk").values(*fields)[offset:offset + 25]),
        })


class PlatformUserCountsView(APIView):
    permission_classes = [IsPlatformAdmin]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(User.objects.aggregate(
            all=Count("pk"),
            active=Count("pk", filter=Q(is_active=True, suspended=False)),
            inactive=Count("pk", filter=Q(is_active=False, suspended=False)),
            disabled=Count("pk", filter=Q(suspended=True)),
        ))


class PlatformUserActivityView(APIView):
    permission_classes = [IsPlatformAdmin]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request, pk):
        account = get_object_or_404(User, pk=pk)
        records = AuditLog.objects.filter(
            Q(actor=account) | Q(entity_type="User", entity_id=str(pk)) |
            Q(entity_type="SupportSession", changes__target_id=pk)
        ).order_by("-timestamp", "-pk")
        from rest_framework.pagination import PageNumberPagination
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(records.values("id", "action", "timestamp", "actor__email", "entity_type"), request)
        return paginator.get_paginated_response(page)


class PlatformOverviewView(PlatformView):
    @extend_schema(operation_id="platform_overview", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return super().get(request)


class SettingsSerializer(serializers.ModelSerializer):
    support_minutes = serializers.IntegerField(min_value=5, max_value=30)

    class Meta:
        model = PlatformSetting
        fields = ("support_minutes", "notification_email", "maintenance_notice")


class PlatformSettingsView(APIView):
    permission_classes = [IsPlatformAdmin]

    @extend_schema(responses=SettingsSerializer)
    def get(self, request):
        data = SettingsSerializer(PlatformSetting.objects.filter(pk=1).first() or PlatformSetting()).data
        data["email_transport"] = django_settings.EMAIL_BACKEND.rsplit(".", 2)[-2]
        data["smtp_host_configured"] = bool(getattr(django_settings, "EMAIL_HOST", "")) and data["email_transport"] == "smtp"
        return Response(data)

    @extend_schema(request=SettingsSerializer, responses=SettingsSerializer)
    @transaction.atomic
    def put(self, request):
        settings, _ = PlatformSetting.objects.select_for_update().get_or_create(pk=1)
        serializer = SettingsSerializer(settings, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        audit_platform(request, "platform.settings_updated", settings, fields=list(serializer.validated_data))
        return Response(serializer.data)


class WorkSerializer(serializers.ModelSerializer):
    confirm = serializers.BooleanField(required=False, write_only=True)

    def validate(self, attrs):
        confirmed = attrs.pop("confirm", False)
        previous = self.instance.status if self.instance else None
        if attrs.get("status") in ("completed", "cancelled") and attrs["status"] != previous and not confirmed:
            raise ValidationError({"confirm": "Confirm the final status."})
        kind = self.context.get("kind")
        if kind == "detection":
            current = self.instance
            rule = attrs.get("configuration", current.configuration if current else {})
            if not isinstance(rule, dict):
                raise ValidationError({"configuration": "Enter a valid rule template."})
            serializer = RuleSerializer(data={**rule, "name": attrs.get("title", current.title if current else "")})
            serializer.is_valid(raise_exception=True)
            attrs["configuration"] = {
                key: serializer.validated_data[key]
                for key in ("event_type", "conditions", "severity", "enabled")
                if key in serializer.validated_data
            }
        elif attrs.get("configuration"):
            raise ValidationError({"configuration": "Configuration is available only for detection templates."})
        return attrs

    class Meta:
        model = PlatformWorkItem
        fields = ("id", "kind", "title", "details", "configuration", "status", "updated_at", "confirm")
        read_only_fields = ("id", "kind", "updated_at")


class PlatformWorkBase(APIView):
    permission_classes = [IsPlatformAdmin]

    def items(self, kind):
        if kind not in dict(PlatformWorkItem._meta.get_field("kind").choices):
            raise ValidationError({"kind": "Choose a valid work category."})
        return PlatformWorkItem.objects.filter(kind=kind)

class PlatformWorkView(PlatformWorkBase):
    @extend_schema(responses=WorkSerializer(many=True))
    def get(self, request, kind):
        query = self.items(kind).order_by("-updated_at", "-pk")
        from rest_framework.pagination import PageNumberPagination
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(query, request)
        return paginator.get_paginated_response(WorkSerializer(page, many=True).data)

    @extend_schema(request=WorkSerializer, responses=WorkSerializer)
    @transaction.atomic
    def post(self, request, kind):
        self.items(kind)
        serializer = WorkSerializer(data=request.data, context={"kind": kind})
        serializer.is_valid(raise_exception=True)
        item = serializer.save(kind=kind)
        audit_platform(request, "platform.work_created", item, kind=kind, status=item.status)
        return Response(serializer.data, status=201)

class PlatformWorkDetailView(PlatformWorkBase):
    @extend_schema(operation_id="platform_work_retrieve", responses=WorkSerializer)
    def get(self, request, kind, pk):
        return Response(WorkSerializer(get_object_or_404(self.items(kind), pk=pk)).data)

    @extend_schema(request=WorkSerializer, responses=WorkSerializer)
    @transaction.atomic
    def patch(self, request, kind, pk):
        item = get_object_or_404(self.items(kind).select_for_update(), pk=pk)
        serializer = WorkSerializer(item, data=request.data, partial=True, context={"kind": kind})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        audit_platform(request, "platform.work_updated", item, kind=kind, status=item.status)
        return Response(serializer.data)


class StatusInput(serializers.Serializer):
    state = serializers.ChoiceField(choices=("active", "inactive", "suspended"))
    confirm = serializers.BooleanField()

    def validate_confirm(self, value):
        if not value:
            raise serializers.ValidationError("Confirm the access change.")
        return value


class PlatformStatusView(APIView):
    permission_classes = [IsPlatformAdmin]

    @extend_schema(request=StatusInput, responses=OpenApiTypes.OBJECT)
    @transaction.atomic
    def post(self, request, kind, pk):
        incoming = StatusInput(data=request.data)
        incoming.is_valid(raise_exception=True)
        state = incoming.validated_data["state"]
        if kind == "tenants":
            item = get_object_or_404(Tenant.objects.select_for_update(), pk=pk)
            previous, item.status = item.status, state
            item.save(update_fields=["status", "updated_at"])
            tenant = item
        elif kind == "users":
            item = get_object_or_404(User.objects.select_for_update(), pk=pk)
            if item.role == "platform_admin":
                raise PermissionDenied("Platform administrator access cannot be changed here.")
            if state == "active" and not item.email_verified:
                raise ValidationError({"state": "Verify this account's email before activation."})
            previous = "suspended" if item.suspended else "active" if item.is_active else "inactive"
            item.is_active = state == "active"
            item.suspended = state == "suspended"
            if previous != state:
                item.session_version += 1
            item.save(update_fields=["is_active", "suspended", "session_version", "updated_at"])
            tenant = item.tenant
        else:
            return Response({"detail": "Unknown resource."}, status=404)
        audit_platform(request, f"platform.{kind}_access_changed", item, tenant, previous=previous, state=state)
        return Response({"state": state})


class SupportInput(serializers.Serializer):
    tenant = serializers.IntegerField(min_value=1)
    target = serializers.IntegerField(min_value=1, required=False)
    reason = serializers.CharField(min_length=10, max_length=500)


class SupportView(APIView):
    permission_classes = [IsPlatformAdmin]

    @extend_schema(request=SupportInput, responses=OpenApiTypes.OBJECT)
    @transaction.atomic
    def post(self, request):
        serializer = SupportInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        tenant = get_object_or_404(Tenant, pk=data["tenant"])
        target = get_object_or_404(User, tenant=tenant, pk=data["target"]) if "target" in data else None
        if target and (not target.is_active or target.suspended or tenant.status != "active" or target.is_platform_admin):
            raise ValidationError({"target": "The account is unavailable for a support workspace."})
        if request.session.get("platform_support"):
            old = SupportSession.objects.filter(pk=request.session["platform_support"], actor=request.user, ended_at__isnull=True).first()
            if old:
                old.ended_at = timezone.now()
                old.save(update_fields=["ended_at"])
                audit_platform(request, "platform.support_ended", old, old.tenant)
        minutes = PlatformSetting.objects.filter(pk=1).values_list("support_minutes", flat=True).first() or 15
        session = SupportSession.objects.create(actor=request.user, tenant=tenant, target=target, reason=data["reason"],
                                                expires_at=timezone.now() + timedelta(minutes=minutes))
        request.session["platform_support"] = session.pk
        audit_platform(request, "platform.support_started", session, tenant, reason=session.reason, target_id=session.target_id)
        return Response({"id": session.pk, "expires_at": session.expires_at}, status=201)

    def active(self, request):
        session = get_object_or_404(
            SupportSession.objects.select_related("tenant", "target"),
            pk=request.session.get("platform_support"), actor=request.user, ended_at__isnull=True, expires_at__gt=timezone.now(),
        )
        if session.target and session.target.tenant_id != session.tenant_id:
            raise PermissionDenied("The target account no longer belongs to this organization.")
        return session

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        session = self.active(request)
        target = session.target
        can_view = session.tenant.status == "active" and (not target or target.is_active)
        directory = {
            "events": (Event, ("id", "event_type", "severity", "received_at")),
            "alerts": (Alert, ("id", "title", "severity", "status", "created_at")),
            "incidents": (Incident, ("id", "reference", "title", "severity", "status", "created_at")),
            "assets": (Asset, ("id", "name", "asset_type", "criticality", "status")),
        } if can_view else {}
        if can_view and (not target or target.role in ("customer_admin", "soc_lead")):
            directory["log-sources"] = (LogSource, ("id", "name", "source_type", "enabled", "last_seen"))
        if can_view and target:
            directory["reports"] = (Report, ("id", "title", "period_start", "period_end", "created_at"))
            if target.role == "soc_lead":
                directory["rules"] = (Rule, ("id", "name", "severity", "event_type", "enabled"))
                directory["playbooks"] = (Playbook, ("id", "name", "enabled", "updated_at"))
            if target.role in ("soc_lead", "customer_admin"):
                directory["audit"] = (AuditLog, ("id", "action", "entity_type", "timestamp"))
        if not target or (can_view and target.role == "customer_admin"):
            directory["users"] = (User, ("id", "full_name", "role", "is_active", "suspended"))
        section = request.query_params.get("section", "")
        records = None
        if section:
            if section not in directory:
                raise PermissionDenied("This section is unavailable in the current support session.")
            model, columns = directory[section]
            query = model.objects.filter(tenant_id=session.tenant_id).order_by("-pk")
            records = {"columns": columns, "results": list(query.values(*columns)[:25]), "count": query.count()}
        audit_platform(request, "platform.support_viewed", session, session.tenant, target_id=session.target_id, section=section or "summary")
        return Response({
            "tenant": session.tenant.name, "reason": session.reason, "expires_at": session.expires_at,
            "target": {"name": target.full_name, "role": target.role, "active": target.is_active} if target else None,
            "sections": list(directory),
            "records": records,
            "counts": {name: model.objects.filter(tenant_id=session.tenant_id).count()
                       for name, (model, _) in directory.items()},
        })

    @extend_schema(request=None, responses={204: None})
    @transaction.atomic
    def delete(self, request):
        session = self.active(request)
        session.ended_at = timezone.now()
        session.save(update_fields=["ended_at"])
        request.session.pop("platform_support", None)
        audit_platform(request, "platform.support_ended", session, session.tenant)
        return Response(status=204)


class PlatformNoticeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        notice = PlatformSetting.objects.filter(pk=1).values_list("maintenance_notice", flat=True).first()
        sessions = SupportSession.objects.filter(
            tenant_id=request.user.tenant_id, ended_at__isnull=True, expires_at__gt=timezone.now(),
            actor__is_active=True, actor__role="platform_admin",
        ).filter(Q(target__isnull=True) | Q(target_id=request.user.pk))
        return Response({"maintenance": notice or "", "support_active": bool(request.user.tenant_id and sessions.exists())})
