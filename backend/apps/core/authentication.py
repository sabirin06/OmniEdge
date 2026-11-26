from django.conf import settings
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied
from django.utils import timezone

SUPPORT_READ_ROUTES = {
    "auth-me", "dashboard", "platform-notice", "user-list", "user-detail", "role-list",
    "event-list", "event-detail", "asset-list", "asset-detail", "logsource-list", "logsource-detail",
    "rule-list", "rule-detail", "alert-list", "alert-detail", "incident-list", "incident-detail",
    "incident-alerts", "incident-timeline", "incident-evidence", "incident-actions",
    "playbook-list", "playbook-detail", "playbook-steps", "playbook-step-detail",
    "report-list", "report-detail", "report-analytics", "report-records", "audit-log-list", "audit-log-detail",
}



class TenantSessionAuthentication(SessionAuthentication):
    def authenticate(self, request):
        projection = request.headers.get("X-OmniEdge-Support")
        if projection and request.method not in ("GET", "HEAD"):
            raise PermissionDenied("Support workspaces are read-only.")
        session = super().authenticate(request)
        if session:
            account = session[0]
            now = int(timezone.now().timestamp())
            start = request.session.get("account_signed_in_at", now)
            last = request.session.get("account_last_seen", now)
            if not account.email_verified or account.suspended or now - start >= settings.SESSION_COOKIE_AGE or now - last >= settings.SESSION_IDLE_SECONDS:
                request.session.flush()
                return None
            if "account_signed_in_at" not in request.session or now - last >= 60:
                request.session.update({"account_signed_in_at": start, "account_last_seen": now})
        if projection:
            return self.support_identity(request, session, projection)
        if session:
            user, _ = session
            match = request.resolver_match
            is_logout = match and match.url_name == "auth-logout"
            if user.tenant_id and user.tenant.status != "active" and not is_logout:
                raise PermissionDenied("Your organization is suspended.")
        return session

    def support_identity(self, request, authentication, projection):
        from apps.incidents.models import AuditLog
        from .models import SupportSession

        actor = authentication[0] if authentication else None
        match = request.resolver_match
        if not actor or not actor.is_platform_admin or not match or match.url_name not in SUPPORT_READ_ROUTES:
            raise PermissionDenied("This endpoint is unavailable in a support workspace.")
        session_id = request.session.get("platform_support")
        if str(session_id) != projection:
            raise PermissionDenied("Start a support session to open the workspace.")
        session = SupportSession.objects.select_related("target__tenant").filter(
            pk=session_id, actor=actor, ended_at__isnull=True, expires_at__gt=timezone.now(),
            tenant__status="active", target__is_active=True, target__suspended=False, target__email_verified=True,
        ).first()
        if session is None or session.target.tenant_id != session.tenant_id or session.target.is_platform_admin:
            raise PermissionDenied("This support session has expired or the account is unavailable.")
        AuditLog.objects.create(
            actor=actor, tenant_id=session.tenant_id, action="platform.support_workspace_read",
            entity_type="SupportSession", entity_id=str(session.pk), request_id=getattr(request, "request_id", ""),
            changes={"target_id": session.target_id, "endpoint": match.url_name, "record_ids": match.kwargs},
        )
        return session.target, None


class TenantSessionAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = TenantSessionAuthentication
    name = "cookieAuth"

    def get_security_definition(self, auto_schema):
        return {"type": "apiKey", "in": "cookie", "name": settings.SESSION_COOKIE_NAME}
