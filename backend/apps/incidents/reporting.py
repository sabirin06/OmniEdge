from django.db.models import Avg, F, Q

from apps.monitoring.models import Alert, Event
from apps.monitoring.queries import tenant_events_with_risk
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

REPORT_TYPES = ("overview", "events", "alerts", "incidents")
ALERT_STATUSES = tuple(value for value, _ in Alert.STATUS_CHOICES)
INCIDENT_STATUSES = tuple(value for value, _ in Incident.STATUS_CHOICES)


def report_queries(tenant, period_start, period_end, report_type="overview", severity="", status=""):
    sources = {
        "events": (Event, "received_at", ()),
        "alerts": (Alert, "created_at", ALERT_STATUSES),
        "incidents": (Incident, "created_at", INCIDENT_STATUSES),
    }
    for key, (model, stamp, statuses) in sources.items():
        if report_type not in ("overview", key) or (status and status not in statuses):
            continue
        records = tenant_events_with_risk(tenant) if key == "events" else model.objects.filter(tenant=tenant)
        records = records.filter(**{f"{stamp}__date__range": (period_start, period_end)}).order_by()
        severity_field = "risk_severity" if key == "events" else "severity"
        if severity:
            records = records.filter(**{severity_field: severity})
        if status:
            records = records.filter(status=status)
        yield key, records, stamp, severity_field, bool(statuses)


def report_analytics(tenant, period_start, period_end, report_type="overview", severity="", status=""):
    """Aggregate the selected records within the caller's organization."""
    from datetime import timedelta
    from django.db.models import Count
    from django.db.models.functions import TruncDate

    queries = list(report_queries(tenant, period_start, period_end, report_type, severity, status))
    series = [key for key, *_ in queries]
    daily = {
        (period_start + timedelta(days=offset)).isoformat(): {key: 0 for key in series}
        for offset in range((period_end - period_start).days + 1)
    }
    totals = {}
    breakdown = []
    for key, records, stamp, severity_field, has_status in queries:
        for row in records.annotate(day=TruncDate(stamp)).values("day").annotate(count=Count("pk")):
            daily[row["day"].isoformat()][key] = row["count"]
        totals[key] = sum(day[key] for day in daily.values())
        for field in ("severity", "status") if has_status else ("severity",):
            column = severity_field if field == "severity" else field
            breakdown.extend(
                {"type": key, "dimension": field, "value": row[column], "count": row["count"]}
                for row in records.values(column).annotate(count=Count("pk")).order_by(column)
            )
    return {
        "tenant": {"id": tenant.pk, "name": tenant.name},
        "filters": {
            "period_start": period_start.isoformat(), "period_end": period_end.isoformat(),
            "report_type": report_type, "severity": severity, "status": status,
        },
        "series": series,
        "totals": totals,
        "daily": [{"date": day, **counts} for day, counts in daily.items()],
        "breakdown": breakdown,
    }
