from .models import Alert, Event


def tenant_events_with_risk(tenant):
    from django.db.models import Case, CharField, F, IntegerField, OuterRef, Subquery, Value, When
    from django.db.models.functions import Coalesce

    alerts = Alert.objects.filter(
        event_id=OuterRef("pk"), tenant_id=OuterRef("tenant_id"),
    ).exclude(status="dismissed").annotate(rank=Case(
        When(severity="critical", then=Value(4)),
        When(severity="high", then=Value(3)),
        When(severity="medium", then=Value(2)),
        When(severity="low", then=Value(1)),
        default=Value(0), output_field=IntegerField(),
    )).order_by("-rank", "pk")
    return Event.objects.select_related("source").filter(tenant=tenant).annotate(
        classified_risk=Coalesce(Subquery(alerts.values("severity")[:1]), "reviewed_risk"),
    ).annotate(risk_severity=Coalesce(
        F("classified_risk"),
        Case(
            When(severity__in=("low", "medium", "high", "critical"), then=F("severity")),
            default=Value("low"),
            output_field=CharField(),
        ),
    ))
