"""
Middleware for automatic audit logging and request tracking.
"""
import uuid
import threading
from django.conf import settings
from django.contrib.auth import logout
from django.http import HttpResponseForbidden
from django.utils import timezone
from django.utils.cache import add_never_cache_headers, patch_vary_headers

_request_local = threading.local()


def get_current_request():
    return getattr(_request_local, "request", None)


class AuditLogMiddleware:
    """Attach a request_id to each request and store request in thread local."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = str(uuid.uuid4())
        _request_local.request = request
        try:
            if request.path_info.startswith("/admin/"):
                now = int(timezone.now().timestamp())
                signed_in = request.session.get("account_signed_in_at")
                last_seen = request.session.get("account_last_seen", 0)
                user = request.user
                if not (user.is_authenticated and user.is_staff and user.is_platform_admin and user.email_verified and signed_in):
                    return HttpResponseForbidden("Sign in through the OmniEdge application before opening Django administration.")
                if now - signed_in >= settings.SESSION_COOKIE_AGE or now - last_seen >= settings.SESSION_IDLE_SECONDS:
                    logout(request)
                    return HttpResponseForbidden("Your session expired. Sign in through OmniEdge again.")
            response = self.get_response(request)
            from .authentication import SUPPORT_READ_ROUTES

            match = request.resolver_match
            if match and match.url_name in SUPPORT_READ_ROUTES:
                patch_vary_headers(response, ("X-OmniEdge-Support",))
            if request.headers.get("X-OmniEdge-Support") or (match and (match.url_name == "account-security" or request.path_info.startswith("/api/v1/auth/"))):
                add_never_cache_headers(response)
            return response
        finally:
            _request_local.request = None
