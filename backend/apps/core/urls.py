"""
Core app URL configuration.
"""
from django.urls import path
from . import views

urlpatterns = [
    # Auth
    path("auth/csrf/", views.CSRFView.as_view(), name="auth-csrf"),
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),

    # Tenants
    path("tenants/", views.TenantListCreateView.as_view(), name="tenant-list"),
    path("tenants/<int:pk>/", views.TenantDetailView.as_view(), name="tenant-detail"),
    path("tenants/<int:pk>/suspend/", views.TenantSuspendView.as_view(), name="tenant-suspend"),
    path("tenants/<int:pk>/activate/", views.TenantActivateView.as_view(), name="tenant-activate"),

    path("roles/", views.ManagedRoleListCreateView.as_view(), name="role-list"),
    path("roles/<int:pk>/", views.ManagedRoleDetailView.as_view(), name="role-detail"),

    # Users
    path("users/", views.UserListCreateView.as_view(), name="user-list"),
    path("users/<int:pk>/", views.UserDetailView.as_view(), name="user-detail"),

    # Dashboard & health
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    path("health/", views.HealthView.as_view(), name="health"),

    # Audit logs
    path("audit-logs/", views.AuditLogListView.as_view(), name="audit-log-list"),
    path("audit-logs/<int:pk>/", views.AuditLogDetailView.as_view(), name="audit-log-detail"),
]
