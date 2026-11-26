import re
from datetime import timedelta

import pyotp
from django.core import mail
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import AccountChallenge, AccountMail, Tenant, User


@override_settings(EMAIL_HOST="local.test", DEFAULT_FROM_EMAIL="security@example.test",
                   EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class AccountSecurityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name="Test Tenant", code="SEC")
        cls.user = User.objects.create_user("member@example.test", "Example-Test-Passphrase-19", role="soc_analyst", tenant=cls.tenant)
        cls.admin = User.objects.create_user("operator@example.test", role="platform_admin")

    def take_mail_code(self):
        call_command("send_account_mail")
        return re.search(r"\b[0-9]{8}\b", mail.outbox[-1].body)[0]

    def test_enrollment_requires_verification_and_queues_welcome(self):
        self.client.force_login(self.admin)
        payload = {"email": "NewAccount@example.test", "full_name": "New Analyst",
                   "role": "soc_analyst", "tenant": self.tenant.pk, "password": "q7!Fr2#m"}
        too_short = self.client.post("/api/v1/users/", {**payload, "password": payload["password"][:-1]},
                                     content_type="application/json")
        self.assertEqual(too_short.status_code, 400)
        self.assertIn("password", too_short.json()["errors"])
        created = self.client.post("/api/v1/users/", payload, content_type="application/json")
        self.assertEqual(created.status_code, 201, created.json())
        user = User.objects.get(pk=created.json()["id"])
        self.assertFalse(user.email_verified)
        self.assertFalse(user.is_active)
        self.assertEqual(self.client.post("/api/v1/users/", {**payload, "email": payload["email"].upper()},
                                          content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post("/api/v1/users/", {**payload, "email": "not-an-email"},
                                          content_type="application/json").status_code, 400)
        anonymous = APIClient()
        self.assertEqual(anonymous.post("/api/v1/auth/login/", {"email": user.email, "password": payload["password"]}).status_code, 401)
        code = self.take_mail_code()
        self.assertEqual(mail.outbox[-1].to, [user.email])
        self.assertEqual(anonymous.post("/api/v1/auth/verify/confirm/", {"email": user.email, "code": code}).status_code, 200)
        self.assertEqual(anonymous.post("/api/v1/auth/verify/confirm/", {"email": user.email, "code": code}).status_code, 400)
        call_command("send_account_mail")
        self.assertEqual(mail.outbox[-1].subject, "Welcome to OmniEdge")
        self.assertEqual(anonymous.post("/api/v1/auth/login/", {"email": user.email, "password": payload["password"]}).status_code, 200)

    def test_reset_single_use_expiry_and_session_invalidation(self):
        old_session = APIClient()
        old_session.force_login(self.user)
        request = "/api/v1/auth/password/request/"
        confirm = "/api/v1/auth/password/confirm/"
        client = APIClient()
        known = client.post(request, {"email": self.user.email})
        unknown = client.post(request, {"email": "missing@example.test"})
        self.assertEqual((known.status_code, known.data), (unknown.status_code, unknown.data))
        self.assertEqual(AccountMail.objects.count(), 1)
        code = self.take_mail_code()
        data = {"email": self.user.email, "code": code, "password": "z9!Kh3@y"}
        too_short = client.post(confirm, {**data, "password": data["password"][:-1]})
        self.assertEqual(too_short.status_code, 400)
        self.assertIn("password", too_short.json()["errors"])
        AccountChallenge.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(client.post(confirm, data).status_code, 400)
        self.assertEqual(client.post(request, {"email": self.user.email}).status_code, 202)
        data["code"] = self.take_mail_code()
        self.assertEqual(client.post(confirm, data).status_code, 200)
        self.assertEqual(client.post(confirm, data).status_code, 400)
        self.assertEqual(old_session.get("/api/v1/auth/me/").status_code, 403)
        self.assertEqual(client.post("/api/v1/auth/login/", {"email": self.user.email, "password": data["password"]}).status_code, 200)

    def test_mfa_recovery_and_revoke_sessions(self):
        client = APIClient()
        client.force_login(self.user)
        endpoint = "/api/v1/auth/security/"
        password = "Example-Test-Passphrase-19"
        started = client.post(endpoint, {"action": "start", "password": password})
        self.assertEqual(started.status_code, 200, started.data)
        code = pyotp.TOTP(started.data["setup_key"]).now()
        enabled = client.post(endpoint, {"action": "enable", "password": password, "code": code})
        self.assertEqual(enabled.status_code, 200, enabled.data)
        recovery = enabled.data["recovery_codes"][0]
        login = "/api/v1/auth/login/"
        second = APIClient()
        payload = {"email": self.user.email, "password": password}
        self.assertEqual(second.post(login, payload).status_code, 428)
        self.assertEqual(second.post(login, {**payload, "otp": code}).status_code, 428)
        self.assertEqual(second.post(login, {**payload, "otp": recovery}).status_code, 200)
        self.assertEqual(APIClient().post(login, {**payload, "otp": recovery}).status_code, 428)
        self.assertEqual(client.delete(endpoint).status_code, 204)
        self.assertEqual(second.get("/api/v1/auth/me/").status_code, 403)

    def test_csrf_rate_limit_and_idle_session(self):
        protected = APIClient(enforce_csrf_checks=True)
        path = "/api/v1/auth/password/request/"
        self.assertEqual(protected.post(path, {"email": self.user.email}).status_code, 403)
        for _ in range(3):
            self.assertEqual(APIClient().post(path, {"email": self.user.email}).status_code, 202)
        throttled = APIClient().post(path, {"email": self.user.email})
        self.assertEqual(throttled.status_code, 429)
        self.assertIn("Retry-After", throttled)
        from apps.core.account_security import increment_limit
        for _ in range(10):
            increment_limit("login.account", self.user.email, 10, 15)
        self.assertEqual(APIClient().post("/api/v1/auth/login/", {"email": self.user.email, "password": "Wrong"}).status_code, 429)
        idle = APIClient()
        idle.force_login(self.user)
        session = idle.session
        session["account_last_seen"] = int((timezone.now() - timedelta(hours=1)).timestamp())
        session.save()
        self.assertEqual(idle.get("/api/v1/auth/me/").status_code, 403)
