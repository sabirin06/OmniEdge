"""
Custom DRF permission classes for OmniEdge role-based access control.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS


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
    """Tenant staff eligible to view monitoring records."""
    def has_permission(self, request, view):
        user = request.user
        return user.is_authenticated and user.tenant_id is not None and user.role in (
            "soc_analyst", "soc_lead", "customer_admin",
        )


class IsTenantCustomerAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return user.is_authenticated and user.tenant_id is not None and user.role == "customer_admin"


class IsTenantLead(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return user.is_authenticated and user.tenant_id is not None and user.role == "soc_lead"


class CanAccessLogSources(BasePermission):
    def has_permission(self, request, view):
        return IsTenantCustomerAdmin().has_permission(request, view) or (
            request.method in SAFE_METHODS and IsTenantLead().has_permission(request, view)
        )


class IsTenantMember(BasePermission):
    """Allow access only to users belonging to the same tenant as the object."""

    def has_object_permission(self, request, view, obj):
        if request.user.role == "platform_admin":
            return True
        tenant_id = getattr(obj, "tenant_id", None)
        return tenant_id is not None and tenant_id == getattr(request.user, "tenant_id", None)


class CanManagePlaybooks(IsTenantLead):
    """Playbook template access is limited to SOC Leads."""


class CanGenerateReport(BasePermission):
    """Analysts can read reports; tenant admins and SOC Leads can generate them."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated or request.user.tenant_id is None:
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return request.user.role in ("customer_admin", "soc_lead", "soc_analyst")
        return request.user.role in ("customer_admin", "soc_lead")


class IsIncidentResponder(BasePermission):
    """Tenant responders write workflow records; Customer Admins can review them."""
    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated or user.tenant_id is None:
            return False
        if request.method in SAFE_METHODS and user.role == "customer_admin":
            return True
        return user.role in ("soc_analyst", "soc_lead")
