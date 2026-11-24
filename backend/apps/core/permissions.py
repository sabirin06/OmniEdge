"""
Custom DRF permission classes for OmniEdge role-based access control.
"""
from rest_framework.permissions import BasePermission


class IsPlatformAdmin(BasePermission):
    """Allow access only to Platform Admins."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "platform_admin"
        )


class IsCustomerAdmin(BasePermission):
    """Allow access to Customer Admins (of their own tenant)."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("customer_admin", "platform_admin")
        )


class IsSOCLead(BasePermission):
    """Allow access to SOC Leads (and above)."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("soc_lead", "customer_admin", "platform_admin")
        )


class IsSOCAnalyst(BasePermission):
    """Allow access to SOC Analysts and above."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("soc_analyst", "soc_lead", "customer_admin", "platform_admin")
        )


class IsTenantMember(BasePermission):
    """Allow access only to users belonging to the same tenant as the object."""

    def has_object_permission(self, request, view, obj):
        if request.user.role == "platform_admin":
            return True
        tenant_id = getattr(obj, "tenant_id", None)
        return tenant_id is not None and tenant_id == getattr(request.user, "tenant_id", None)


class CanManagePlaybooks(BasePermission):
    """SOC Lead and above can write playbooks; analysts can read."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return request.user.role in (
                "soc_analyst", "soc_lead", "customer_admin", "platform_admin"
            )
        return request.user.role in ("soc_lead", "customer_admin", "platform_admin")


class CanGenerateReport(BasePermission):
    """Customer Admin and SOC Lead can generate/view reports."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("customer_admin", "soc_lead", "platform_admin")
        )
