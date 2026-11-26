"""
Core app URL configuration.
"""
from django.urls import path
from . import views, account_views as accounts, platform_views as platform

urlpatterns = [
    path("platform/", platform.PlatformOverviewView.as_view(), name="platform-overview"),
    path("platform/user-counts/", platform.PlatformUserCountsView.as_view(), name="platform-user-counts"),
    path("platform/users/<int:pk>/activity/", platform.PlatformUserActivityView.as_view(), name="platform-user-activity"),
    path("platform/settings/", platform.PlatformSettingsView.as_view(), name="platform-settings"),
    path("platform/notice/", platform.PlatformNoticeView.as_view(), name="platform-notice"),
    path("platform/support/", platform.SupportView.as_view(), name="platform-support"),
    path("platform/access/<str:kind>/<int:pk>/", platform.PlatformStatusView.as_view(), name="platform-access"),
    path("platform/work/<str:kind>/", platform.PlatformWorkView.as_view(), name="platform-work"),
    path("platform/work/<str:kind>/<int:pk>/", platform.PlatformWorkDetailView.as_view(), name="platform-work-detail"),
    path("platform/<str:section>/", platform.PlatformView.as_view(), name="platform-section"),

    # Auth
    path("auth/csrf/", views.CSRFView.as_view(), name="auth-csrf"),
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/password/request/", accounts.CodeDelivery.as_view(), name="password-request"),
    path("auth/password/confirm/", accounts.CodeConfirmation.as_view(), name="password-confirm"),
    path("auth/verify/request/", accounts.VerifyDelivery.as_view(), name="verification-request"),
    path("auth/verify/confirm/", accounts.VerifyConfirmation.as_view(), name="verification-confirm"),
    path("auth/security/", accounts.AccountSecurityView.as_view(), name="account-security"),
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
