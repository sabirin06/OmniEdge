"""Account security primitives shared by enrollment, recovery and sign-in."""
import base64
import secrets
from datetime import timedelta

import pyotp
from cryptography.fernet import Fernet
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from rest_framework.exceptions import APIException, Throttled

from .models import AccountChallenge, AccountMail, AuthRateBucket, User


class MailUnavailable(APIException):
    status_code = 503
    default_detail = "Email delivery is unavailable. Contact your administrator."


def mail_configured():
    return bool(settings.EMAIL_HOST and settings.DEFAULT_FROM_EMAIL)


def cipher():
    key = salted_hmac("omniedge.account.encryption", "v1", algorithm="sha256").digest()
    return Fernet(base64.urlsafe_b64encode(key))


def fingerprint(tag, value):
    return salted_hmac(f"omniedge.account.{tag}", value, algorithm="sha256").hexdigest()


def audit_auth(request, action, user=None):
    from apps.incidents.models import AuditLog

    AuditLog.objects.create(
        actor=user, tenant_id=user.tenant_id if user else None, action=f"auth.{action}",
        entity_type="Authentication", request_id=getattr(request, "request_id", ""),
    )


@transaction.atomic
def increment_limit(scope, key, limit, minutes):
    now = timezone.now()
    row, _ = AuthRateBucket.objects.select_for_update().get_or_create(
        key=fingerprint(scope, key), defaults={"expires_at": now + timedelta(minutes=minutes)},
    )
    if row.expires_at <= now:
        row.expires_at = now + timedelta(minutes=minutes)
        row.count = 0
    if row.count >= limit:
        return max(1, int((row.expires_at - now).total_seconds()))
    row.count += 1
    row.save(update_fields=["count", "expires_at"])
    return None


def rate_limit(request, scope, identifier="", *, limit=10, ip_limit=60, minutes=15):
    ip = request.META.get("REMOTE_ADDR", "unknown")
    if getattr(settings, "ACCOUNT_TRUST_PROXY_IP", False):
        ip = request.META.get("HTTP_X_FORWARDED_FOR", ip).split(",")[-1].strip()
    wait = increment_limit(scope + ".ip", ip, ip_limit, minutes)
    if wait is None and identifier:
        wait = increment_limit(scope + ".account", identifier.casefold(), limit, minutes)
    if wait:
        audit_auth(request, "rate_limited")
        raise Throttled(wait=wait)


def queue_mail(user, subject, body, expires_at):
    AccountMail.objects.create(
        recipient=user.email, subject=subject, encrypted_body=cipher().encrypt(body.encode()).decode(),
        expires_at=expires_at, next_attempt_at=timezone.now(),
    )


def issue_code(user, purpose):
    expires = timezone.now() + timedelta(minutes=15)
    code = f"{secrets.randbelow(100_000_000):08d}"
    digest = fingerprint(purpose, f"{user.pk}:{user.email.casefold()}:{code}")
    AccountChallenge.objects.update_or_create(
        user=user, purpose=purpose,
        defaults={"digest": digest, "expires_at": expires, "attempts": 0, "consumed": False},
    )
    action = "verify your account" if purpose == "verify" else "reset your password"
    subject = f"OmniEdge code to {action}"
    AccountMail.objects.filter(recipient=user.email, subject=subject, sent_at__isnull=True).delete()
    queue_mail(user, subject,
               f"Hello {user.full_name or 'there'},\n\nYour OmniEdge code to {action} is {code}.\n"
               "It expires in 15 minutes and can be used once. If you did not request this, ignore this email.\n\nOmniEdge Security",
               expires)


def consume_code(user, purpose, code):
    row = AccountChallenge.objects.select_for_update().filter(user=user, purpose=purpose).first()
    guess = fingerprint(purpose, f"{user.pk}:{user.email.casefold()}:{code}")
    if not row or row.consumed or row.attempts >= 5 or row.expires_at <= timezone.now():
        return False
    row.attempts += 1
    row.consumed = constant_time_compare(row.digest, guess)
    row.save(update_fields=["attempts", "consumed"])
    return row.consumed


def matching_totp_step(secret, code, last_step=-1):
    if not code:
        return None
    totp = pyotp.TOTP(secret)
    current = int(timezone.now().timestamp()) // totp.interval
    for step in (current, current - 1, current + 1):
        if step > last_step and constant_time_compare(totp.at(step * totp.interval), code):
            return step
    return None


@transaction.atomic
def check_login_totp(user, code):
    account = User.objects.select_for_update().get(pk=user.pk)
    if not account.mfa_secret:
        return False
    if code and "-" in code:
        return consume_recovery_code(account, code)
    step = matching_totp_step(cipher().decrypt(account.mfa_secret.encode()).decode(), code, account.mfa_last_step)
    if step is None:
        return False
    account.mfa_last_step = step
    account.save(update_fields=["mfa_last_step"])
    return True


def generate_recovery_codes(account):
    codes = []
    for _ in range(8):
        value = secrets.token_hex(8).upper()
        codes.append("-".join(value[index:index + 4] for index in range(0, 16, 4)))
    account.mfa_recovery = [fingerprint("mfa.recovery", f"{account.pk}:{code}") for code in codes]
    return codes


def consume_recovery_code(account, code):
    if not code or "-" not in code:
        return False
    digest = fingerprint("mfa.recovery", f"{account.pk}:{code.upper()}")
    for stored in account.mfa_recovery:
        if constant_time_compare(stored, digest):
            account.mfa_recovery.remove(stored)
            account.save(update_fields=["mfa_recovery"])
            return True
    return False
