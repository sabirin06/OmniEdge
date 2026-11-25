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
