from django.conf import settings
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied


class TenantSessionAuthentication(SessionAuthentication):
    def authenticate(self, request):
        session = super().authenticate(request)
        if session:
            user, _ = session
            match = request.resolver_match
            is_logout = match and match.url_name == "auth-logout"
            if user.tenant_id and user.tenant.status == "suspended" and not is_logout:
                raise PermissionDenied("Your organization is suspended.")
        return session


class TenantSessionAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = TenantSessionAuthentication
    name = "cookieAuth"

    def get_security_definition(self, auto_schema):
        return {"type": "apiKey", "in": "cookie", "name": settings.SESSION_COOKIE_NAME}
