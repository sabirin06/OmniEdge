"""
Custom exception handler for uniform error responses.
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        payload = {
            "success": False,
            "errors": response.data,
            "status_code": response.status_code,
        }
        response.data = payload

    return response
