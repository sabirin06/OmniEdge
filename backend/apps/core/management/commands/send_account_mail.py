"""Send queued security email through the configured SMTP transport."""
from datetime import timedelta
from time import sleep

from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.core.account_security import cipher, mail_configured
from apps.core.models import AccountChallenge, AccountMail, AuthRateBucket


class Command(BaseCommand):
    help = "Deliver queued account emails. Use --watch to run a persistent worker."

    def add_arguments(self, parser):
        parser.add_argument("--watch", action="store_true")

    def handle(self, *args, **options):
        if not mail_configured():
            raise CommandError("Configure EMAIL_HOST and DEFAULT_FROM_EMAIL before starting delivery.")
        while True:
            now = timezone.now()
            AccountMail.objects.filter(expires_at__lte=now).delete()
            AuthRateBucket.objects.filter(expires_at__lte=now).delete()
            AccountChallenge.objects.filter(expires_at__lte=now).delete()
            for _ in range(30):
                if not self.deliver():
                    break
            if not options["watch"]:
                return
            sleep(3)

    @transaction.atomic
    def deliver(self):
        now = timezone.now()
        message = AccountMail.objects.select_for_update(skip_locked=True).filter(
            expires_at__gt=now, next_attempt_at__lte=now, sent_at__isnull=True, attempts__lt=5,
        ).order_by("next_attempt_at").first()
        if not message:
            return False
        try:
            sent = send_mail(message.subject, cipher().decrypt(message.encrypted_body.encode()).decode(),
                             None, [message.recipient], fail_silently=False)
            if sent != 1:
                raise RuntimeError("SMTP did not accept the message.")
        except Exception as exc:
            message.attempts += 1
            message.next_attempt_at = now + timedelta(seconds=15 * 2 ** message.attempts)
            message.save(update_fields=["attempts", "next_attempt_at"])
            self.stderr.write(f"Account mail delivery failed for queue item {message.pk} ({type(exc).__name__}).")
        else:
            message.sent_at = now
            message.encrypted_body = ""
            message.save(update_fields=["sent_at", "encrypted_body"])
        return True
