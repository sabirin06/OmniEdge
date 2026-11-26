"""
Incidents app URL configuration.
"""
from django.urls import path
from . import views

urlpatterns = [
    # Incidents
    path("incidents/", views.IncidentListCreateView.as_view(), name="incident-list"),
    path("incidents/<int:pk>/", views.IncidentDetailView.as_view(), name="incident-detail"),
    path("incidents/<int:pk>/transition/", views.IncidentTransitionView.as_view(), name="incident-transition"),
    path("incidents/<int:pk>/linked-alerts/", views.IncidentLinkedAlertsView.as_view(), name="incident-alerts"),
    path("incidents/<int:pk>/timeline/", views.IncidentTimelineView.as_view(), name="incident-timeline"),
    path("incidents/<int:pk>/evidence/", views.IncidentEvidenceView.as_view(), name="incident-evidence"),
    path("incidents/<int:pk>/evidence/<int:eid>/download/", views.EvidenceDownloadView.as_view(), name="evidence-download"),
    path("incidents/<int:pk>/apply-playbook/", views.IncidentApplyPlaybookView.as_view(), name="incident-apply-playbook"),
    path("incidents/<int:pk>/actions/", views.IncidentActionListCreateView.as_view(), name="incident-actions"),
    path("incidents/<int:pk>/actions/<int:aid>/transition/", views.ActionTransitionView.as_view(), name="action-transition"),

    # Playbooks
    path("playbooks/", views.PlaybookListCreateView.as_view(), name="playbook-list"),
    path("playbooks/<int:pk>/", views.PlaybookDetailView.as_view(), name="playbook-detail"),
    path("playbooks/<int:pk>/steps/", views.PlaybookStepListCreateView.as_view(), name="playbook-steps"),
    path("playbooks/<int:pk>/steps/<int:sid>/", views.PlaybookStepDetailView.as_view(), name="playbook-step-detail"),

    # Reports
    path("reports/", views.ReportListCreateView.as_view(), name="report-list"),
    path("reports/analytics/", views.ReportAnalyticsView.as_view(), name="report-analytics"),
    path("reports/export/", views.ReportExportView.as_view(), name="report-export"),
    path("reports/records/", views.ReportRecordsView.as_view(), name="report-records"),
    path("reports/records/export/", views.ReportRecordExportView.as_view(), name="report-record-export"),
    path("reports/<int:pk>/", views.ReportDetailView.as_view(), name="report-detail"),
]
