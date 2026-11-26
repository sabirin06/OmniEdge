"""
Core models: Tenant and custom User.
"""
import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Tenant(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("suspended", "Suspended"),
        ("inactive", "Inactive"),
    ]

    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True, db_index=True)
    industry = models.CharField(max_length=100)
    contact_email = models.EmailField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active", db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "core_tenant"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


ROLE_CHOICES = [
    ("platform_admin", "Platform Admin"),
    ("customer_admin", "Customer Admin"),
    ("soc_analyst", "SOC Analyst"),
    ("soc_lead", "SOC Lead"),
]


class ManagedRole(models.Model):
    name = models.CharField(max_length=100, unique=True)
    base_role = models.CharField(max_length=30, choices=ROLE_CHOICES)

    class Meta:
        db_table = "core_managed_role"
        ordering = ["name"]


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", "platform_admin")
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = ROLE_CHOICES

    email = models.EmailField(unique=True, db_index=True)
    full_name = models.CharField(max_length=255)
    theme = models.CharField(
        max_length=6, choices=[("system", "System"), ("dark", "Dark"), ("light", "Light")], default="system",
    )
    dashboard_refresh_seconds = models.PositiveSmallIntegerField(
        choices=[(0, "Off"), (15, "15 seconds"), (30, "30 seconds"), (60, "60 seconds")], default=30,
    )
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, db_index=True)
    managed_role = models.ForeignKey(
        ManagedRole, null=True, blank=True, on_delete=models.PROTECT, related_name="users",
    )
    tenant = models.ForeignKey(
        Tenant,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="users",
    )
    is_active = models.BooleanField(default=True)
    suspended = models.BooleanField(default=False)
    email_verified = models.BooleanField(default=True)
    activate_after_verification = models.BooleanField(default=False)
    mfa_secret = models.TextField(blank=True)
    mfa_last_step = models.BigIntegerField(default=-1)
    mfa_recovery = models.JSONField(default=list, blank=True)
    session_version = models.PositiveIntegerField(default=0)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name", "role"]

    objects = UserManager()

    class Meta:
        db_table = "core_user"
        ordering = ["full_name"]

    def __str__(self):
        return f"{self.full_name} <{self.email}>"

    def _get_session_auth_hash(self, secret=None):
        if self.session_version == 0:
            return super()._get_session_auth_hash(secret)
        from django.utils.crypto import salted_hmac

        return salted_hmac(
            "omniedge.account.session", f"{self.password}:{self.session_version}", secret=secret, algorithm="sha256",
        ).hexdigest()

    @property
    def is_platform_admin(self):
        return self.role == "platform_admin"

    @property
    def is_customer_admin(self):
        return self.role == "customer_admin"

    @property
    def is_soc_analyst(self):
        return self.role == "soc_analyst"

    @property
    def is_soc_lead(self):
        return self.role == "soc_lead"

class PlatformSetting(models.Model):
    support_minutes = models.PositiveSmallIntegerField(default=15)
    notification_email = models.EmailField(blank=True)
    maintenance_notice = models.CharField(max_length=300, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class PlatformWorkItem(models.Model):
    kind = models.CharField(max_length=20, db_index=True, choices=[
        ("ticket", "Support ticket"), ("backup", "Backup verification"),
        ("maintenance", "Maintenance"), ("detection", "Detection template"),
        ("integration", "Integration registry"),
    ])
    title = models.CharField(max_length=160)
    details = models.TextField(max_length=4000)
    configuration = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, default="open", choices=[
        ("open", "Open"), ("in_progress", "In progress"), ("completed", "Completed"), ("cancelled", "Cancelled"),
    ])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class SupportSession(models.Model):
    actor = models.ForeignKey(User, on_delete=models.PROTECT, related_name="platform_support_sessions")
    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name="support_sessions")
    target = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT, related_name="support_previews")
    reason = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)
    ended_at = models.DateTimeField(null=True, blank=True)

class AccountChallenge(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    purpose = models.CharField(max_length=16)
    digest = models.CharField(max_length=64)
    expires_at = models.DateTimeField(db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "purpose"], name="unique_user_account_challenge")]


class AccountMail(models.Model):
    recipient = models.EmailField()
    subject = models.CharField(max_length=160)
    encrypted_body = models.TextField()
    expires_at = models.DateTimeField(db_index=True)
    next_attempt_at = models.DateTimeField(db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    sent_at = models.DateTimeField(null=True)


class AuthRateBucket(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    expires_at = models.DateTimeField(db_index=True)
    count = models.PositiveIntegerField(default=0)
