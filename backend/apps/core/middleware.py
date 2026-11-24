"""
Middleware for automatic audit logging and request tracking.
"""
import uuid
import threading

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
            return self.get_response(request)
        finally:
            _request_local.request = None
