"""
Monitoring app URL configuration.
"""
from django.urls import path
from . import views

urlpatterns = [
    # Assets
    path("assets/", views.AssetListCreateView.as_view(), name="asset-list"),
    path("assets/<int:pk>/", views.AssetDetailView.as_view(), name="asset-detail"),

    # Log Sources
    path("log-sources/", views.LogSourceListCreateView.as_view(), name="logsource-list"),
    path("log-sources/<int:pk>/", views.LogSourceDetailView.as_view(), name="logsource-detail"),
    path("log-sources/<int:pk>/rotate-key/", views.LogSourceRotateKeyView.as_view(), name="logsource-rotate-key"),

    # Ingestion
    path("ingest/events/", views.EventIngestView.as_view(), name="event-ingest"),

    # Simulator
    path("simulator/generate/", views.SimulatorView.as_view(), name="simulator-generate"),

    # Events
    path("events/", views.EventListView.as_view(), name="event-list"),
    path("events/<int:pk>/", views.EventDetailView.as_view(), name="event-detail"),

    # Rules
    path("rules/", views.RuleListCreateView.as_view(), name="rule-list"),
    path("rules/<int:pk>/", views.RuleDetailView.as_view(), name="rule-detail"),
    path("rules/<int:pk>/enable/", views.RuleEnableView.as_view(), name="rule-enable"),
    path("rules/<int:pk>/disable/", views.RuleDisableView.as_view(), name="rule-disable"),

    # Alerts
    path("alerts/", views.AlertListView.as_view(), name="alert-list"),
    path("alerts/<int:pk>/", views.AlertDetailView.as_view(), name="alert-detail"),
    path("alerts/<int:pk>/claim/", views.AlertClaimView.as_view(), name="alert-claim"),
    path("alerts/<int:pk>/triage/", views.AlertTriageView.as_view(), name="alert-triage"),
    path("alerts/<int:pk>/dismiss/", views.AlertDismissView.as_view(), name="alert-dismiss"),
    path("alerts/<int:pk>/escalate/", views.AlertEscalateView.as_view(), name="alert-escalate"),
]
