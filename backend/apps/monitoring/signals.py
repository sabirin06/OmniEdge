"""
Monitoring signals: auto-match rules when an Event is created.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Event, Rule, Alert

@receiver(post_save, sender=Event)
def match_rules_on_event(sender, instance: Event, created: bool, **kwargs):
    """When a new Event is ingested, check all enabled rules and create Alerts."""
    if not created:
        return

    rules = Rule.objects.filter(tenant=instance.tenant, enabled=True)
    for rule in rules:
        if rule.matches_event(instance):
            Alert.objects.create(
                tenant=instance.tenant,
                event=instance,
                rule=rule,
                title=f"[{rule.severity.upper()}] {rule.name} — {instance.event_type}",
                severity=rule.severity,
                status="new",
                rule_snapshot={
                    "id": rule.id,
                    "name": rule.name,
                    "event_type": rule.event_type,
                    "conditions": rule.conditions,
                    "severity": rule.severity,
                },
            )
