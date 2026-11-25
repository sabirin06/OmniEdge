from django.db.models import Avg, F, Q

from apps.monitoring.models import Alert, Event
from .models import Incident


def report_metrics(tenant, period_start, period_end):
    """Compute the metrics stored in a tenant report snapshot."""
    events_qs = Event.objects.filter(
        tenant=tenant,
        received_at__date__gte=period_start,
        received_at__date__lte=period_end,
    )
    alerts_qs = Alert.objects.filter(
        tenant=tenant,
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    )
    incidents_qs = Incident.objects.filter(
        tenant=tenant,
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    )

    # Event counts
    event_counts = {s: events_qs.filter(severity=s).count() for s in ["info", "low", "medium", "high", "critical"]}

    # Alert severity breakdown
    alert_severity = {s: alerts_qs.filter(severity=s).count() for s in ["low", "medium", "high", "critical"]}

    # Incident outcomes
    incident_outcomes = {s: incidents_qs.filter(status=s).count() for s in ["open", "investigating", "containment", "resolved", "closed"]}

    # Open workload
    open_alerts = Alert.objects.filter(tenant=tenant).exclude(status__in=["dismissed", "resolved"]).count()
    open_incidents = Incident.objects.filter(tenant=tenant).exclude(status__in=["resolved", "closed"]).count()

    detection = alerts_qs.filter(
        Q(rule_snapshot__origin__isnull=True) | ~Q(rule_snapshot__origin="manual_review"),
        created_at__gte=F("event__received_at"),
    ).aggregate(duration=Avg(F("created_at") - F("event__received_at")))["duration"]
    resolution = incidents_qs.filter(resolved_at__isnull=False).aggregate(
        duration=Avg(F("resolved_at") - F("created_at")),
    )["duration"]
    return {
        "method_version": 2,
        "mean_time_to_detect_minutes": round(detection.total_seconds() / 60, 2) if detection is not None else None,
        "mean_time_to_respond_minutes": round(resolution.total_seconds() / 60, 2) if resolution is not None else None,
        "period": {"start": str(period_start), "end": str(period_end)},
        "events": {"total": events_qs.count(), "by_severity": event_counts},
        "alerts": {"total": alerts_qs.count(), "by_severity": alert_severity},
        "incidents": {"total": incidents_qs.count(), "by_status": incident_outcomes},
        "open_workload": {"alerts": open_alerts, "incidents": open_incidents},
    }
