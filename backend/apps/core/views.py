"""
Core views: auth, tenant management, user management, dashboard, audit logs.
"""
import logging
from django.contrib.auth import login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from drf_spectacular.utils import extend_schema, inline_serializer
from django.db.models import Count, Q
from rest_framework import generics, serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ManagedRole, Tenant, User
from .serializers import (
    TenantSerializer, UserSerializer, UserMeSerializer,
    LoginSerializer, AuditLogSerializer, ManagedRoleSerializer,
)
from .permissions import IsCustomerAdmin, IsPlatformAdmin, IsSOCLead

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Auth views
# ---------------------------------------------------------------------------

class CSRFView(APIView):
    """Return CSRF cookie — must be called before POST requests from SPA."""
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=None, responses=inline_serializer(name="CsrfToken", fields={"csrfToken": serializers.CharField()}))
    def get(self, request):
        token = get_token(request)
        return Response({"csrfToken": token})


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=LoginSerializer, responses=UserSerializer)
    @method_decorator(csrf_protect)
    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError:
            return Response({"error": "Invalid email or password."}, status=status.HTTP_401_UNAUTHORIZED)
        user = serializer.validated_data["user"]
        login(request, user)
        user_data = UserSerializer(user).data
        return Response({"user": user_data, **user_data})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=inline_serializer(name="LogoutResult", fields={"detail": serializers.CharField()}))
    def post(self, request):
        logout(request)
        return Response({"detail": "Logged out successfully."})


class MeView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserMeSerializer

    def get_object(self):
        return self.request.user


# ---------------------------------------------------------------------------
# Tenant views
# ---------------------------------------------------------------------------

class TenantListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsPlatformAdmin]
    serializer_class = TenantSerializer
    queryset = Tenant.objects.annotate(active_users=Count("users", filter=Q(users__is_active=True)))
    search_fields = ["name", "code", "industry"]
    ordering_fields = ["name", "created_at", "status"]
    ordering = ["name"]


    def get_queryset(self):
        qs = super().get_queryset()
        state = self.request.query_params.get("status")
        return qs.filter(status=state) if state else qs


class TenantDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsPlatformAdmin]
    serializer_class = TenantSerializer
    queryset = Tenant.objects.all()


class TenantSuspendView(APIView):
    permission_classes = [IsPlatformAdmin]

    @extend_schema(request=None, responses=TenantSerializer)
    def post(self, request, pk):
        try:
            tenant = Tenant.objects.get(pk=pk)
        except Tenant.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        tenant.status = "suspended"
        tenant.save(update_fields=["status", "updated_at"])
        return Response(TenantSerializer(tenant).data)


class TenantActivateView(APIView):
    permission_classes = [IsPlatformAdmin]

    @extend_schema(request=None, responses=TenantSerializer)
    def post(self, request, pk):
        try:
            tenant = Tenant.objects.get(pk=pk)
        except Tenant.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        tenant.status = "active"
        tenant.save(update_fields=["status", "updated_at"])
        return Response(TenantSerializer(tenant).data)


# ---------------------------------------------------------------------------
# User views
# ---------------------------------------------------------------------------

class ManagedRoleListCreateView(generics.ListCreateAPIView):
    serializer_class = ManagedRoleSerializer
    pagination_class = None

    def get_permissions(self):
        return [IsCustomerAdmin()] if self.request.method in ("GET", "HEAD", "OPTIONS") else [IsPlatformAdmin()]

    def get_queryset(self):
        roles = ManagedRole.objects.all()
        if not self.request.user.is_platform_admin:
            roles = roles.exclude(base_role="platform_admin")
        return roles


class ManagedRoleDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsPlatformAdmin]
    serializer_class = ManagedRoleSerializer
    queryset = ManagedRole.objects.all()


class UserListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer
    search_fields = ["email", "full_name"]
    ordering_fields = ["full_name", "created_at", "role"]
    ordering = ["full_name"]

    def get_permissions(self):
        return [IsCustomerAdmin()] if self.request.method == "POST" else [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.is_platform_admin:
            return User.objects.select_related("tenant", "managed_role").all()
        return User.objects.select_related("tenant", "managed_role").filter(tenant=user.tenant)

    def perform_create(self, serializer):
        user = self.request.user
        # Non-platform-admins always create users in their own tenant
        if not user.is_platform_admin:
            serializer.save(tenant=user.tenant)
        else:
            serializer.save()


class UserDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_permissions(self):
        return [IsCustomerAdmin()] if self.request.method in ("PATCH", "PUT") else [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.is_platform_admin:
            return User.objects.select_related("tenant", "managed_role").all()
        return User.objects.select_related("tenant", "managed_role").filter(tenant=user.tenant)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=serializers.DictField())
    def get(self, request):
        from apps.monitoring.models import Alert, Event
        from apps.incidents.models import Incident, Action
        from apps.monitoring.serializers import AlertSerializer
        from django.utils import timezone
        import datetime

        user = request.user
        tenant = user.tenant

        if user.is_platform_admin:
            return Response({
                "tenants": Tenant.objects.count(),
                "active_tenants": Tenant.objects.filter(status="active").count(),
                "total_users": User.objects.filter(is_active=True).count(),
                "total_alerts_new": Alert.objects.filter(status="new").count(),
                "active_incidents": Incident.objects.exclude(status__in=["resolved", "closed"]).count(),
                "events_24h": Event.objects.filter(received_at__gte=timezone.now() - datetime.timedelta(hours=24)).count(),
                "open_tasks": Action.objects.filter(status__in=["pending", "in_progress"]).count(),
                "alerts_by_severity": [
                    {"severity": s, "count": Alert.objects.filter(severity=s).count()}
                    for s in ["critical", "high", "medium", "low", "info"]
                ],
                "incidents_by_status": [
                    {"status": s, "count": Incident.objects.filter(status=s).count()}
                    for s in ["open", "investigating", "containment", "resolved", "closed"]
                ],
                "recent_alerts": AlertSerializer(Alert.objects.select_related("event", "rule", "assignee")[:8], many=True).data,
            })

        alerts_qs = Alert.objects.filter(tenant=tenant)
        incidents_qs = Incident.objects.filter(tenant=tenant)
        events_qs = Event.objects.filter(tenant=tenant)
        actions_qs = Action.objects.filter(tenant=tenant)

        sev_counts = [
            {"severity": s, "count": alerts_qs.filter(severity=s).count()}
            for s in ["critical", "high", "medium", "low", "info"]
        ]
        status_counts = [
            {"status": s, "count": incidents_qs.filter(status=s).count()}
            for s in ["open", "investigating", "containment", "resolved", "closed"]
        ]
        recent_alerts = AlertSerializer(alerts_qs.select_related("event", "rule", "assignee")[:8], many=True).data

        return Response({
            "total_alerts_new": alerts_qs.filter(status="new").count(),
            "active_incidents": incidents_qs.exclude(status__in=["resolved", "closed"]).count(),
            "events_24h": events_qs.filter(received_at__gte=timezone.now() - datetime.timedelta(hours=24)).count(),
            "open_tasks": actions_qs.filter(status__in=["pending", "in_progress"]).count(),
            "alerts_by_severity": sev_counts,
            "incidents_by_status": status_counts,
            "recent_alerts": recent_alerts,
            "alerts": {
                "new": alerts_qs.filter(status="new").count(),
                "in_review": alerts_qs.filter(status="in_review").count(),
                "escalated": alerts_qs.filter(status="escalated").count(),
                "total_open": alerts_qs.exclude(status__in=["dismissed", "resolved"]).count(),
            },
            "incidents": {
                "open": incidents_qs.filter(status="open").count(),
                "investigating": incidents_qs.filter(status="investigating").count(),
                "containment": incidents_qs.filter(status="containment").count(),
                "total_active": incidents_qs.exclude(status__in=["resolved", "closed"]).count(),
            },
            "my_alerts": alerts_qs.filter(assignee=user, status__in=["new", "in_review"]).count(),
            "my_incidents": incidents_qs.filter(owner=user).exclude(status="closed").count(),
        })


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=None, responses=inline_serializer(name="HealthResult", fields={"status": serializers.CharField(), "database": serializers.CharField(), "version": serializers.CharField()}))
    def get(self, request):
        from django.db import connection
        try:
            connection.ensure_connection()
            db_ok = True
        except Exception:
            db_ok = False
        return Response({
            "status": "ok" if db_ok else "degraded",
            "database": "connected" if db_ok else "error",
            "version": "1.0.0",
        })


# ---------------------------------------------------------------------------
# Audit Log views
# ---------------------------------------------------------------------------

class AuditLogListView(generics.ListAPIView):
    permission_classes = [IsSOCLead]
    serializer_class = AuditLogSerializer
    ordering_fields = ["timestamp"]
    ordering = ["-timestamp"]

    def get_queryset(self):
        from apps.incidents.models import AuditLog
        user = self.request.user
        qs = AuditLog.objects.select_related("actor", "tenant")
        if not user.is_platform_admin:
            qs = qs.filter(tenant=user.tenant)
        entity_type = self.request.query_params.get("entity_type")
        if entity_type:
            qs = qs.filter(entity_type=entity_type)
        return qs


class AuditLogDetailView(generics.RetrieveAPIView):
    permission_classes = [IsSOCLead]
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        from apps.incidents.models import AuditLog
        user = self.request.user
        qs = AuditLog.objects.select_related("actor", "tenant")
        if not user.is_platform_admin:
            qs = qs.filter(tenant=user.tenant)
        return qs
