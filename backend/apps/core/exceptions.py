"""Consistent API error metadata for clients."""
from rest_framework.views import exception_handler


def error_codes(value):
    if isinstance(value, dict):
        return {key: error_codes(item) for key, item in value.items()}
    if isinstance(value, list):
        return [error_codes(item) for item in value]
    return getattr(value, "code", None)


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        errors = response.data
        response.data = {
            "success": False,
            "errors": errors,
            "field_codes": error_codes(errors),
            "status_code": response.status_code,
        }
    return response
