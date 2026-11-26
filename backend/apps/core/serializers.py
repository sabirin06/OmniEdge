"""
Core serializers: Tenant, User, AuditLog.
"""
from django.contrib.auth import authenticate, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from .account_security import issue_code, mail_configured
from rest_framework import serializers
from .models import ManagedRole, Tenant, User


class TenantSerializer(serializers.ModelSerializer):
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            "id", "name", "code", "industry", "contact_email",
            "status", "user_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "user_count"]

    def get_user_count(self, obj) -> int:
        return obj.users.filter(is_active=True).count()


class TenantMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ["id", "name", "code", "status"]


class ManagedRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ManagedRole
        fields = ["id", "name", "base_role"]

    def validate_name(self, value):
        roles = ManagedRole.objects.filter(name__iexact=value)
        if self.instance:
            roles = roles.exclude(pk=self.instance.pk)
        if roles.exists() or any(label.casefold() == value.casefold() for _, label in User.ROLE_CHOICES):
            raise serializers.ValidationError("A role with this name already exists.")
        return value

    def validate_base_role(self, value):
        if self.instance and value != self.instance.base_role:
            raise serializers.ValidationError("Create a new role to use a different permission level.")
        return value


class UserSerializer(serializers.ModelSerializer):
    suspended = serializers.BooleanField(read_only=True)
    verification_email_available = serializers.SerializerMethodField()
    tenant_detail = TenantMinimalSerializer(source="tenant", read_only=True)
    password = serializers.CharField(write_only=True, required=False, min_length=8, max_length=128, trim_whitespace=False)
    managed_role_detail = ManagedRoleSerializer(source="managed_role", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "full_name", "role", "tenant", "tenant_detail",
            "is_active", "suspended", "email_verified", "verification_email_available", "last_login", "created_at", "updated_at", "password",
            "managed_role", "managed_role_detail", "theme", "dashboard_refresh_seconds",
        ]
        read_only_fields = ["id", "email_verified", "last_login", "created_at", "updated_at", "theme", "dashboard_refresh_seconds"]
        extra_kwargs = {
            "tenant": {"write_only": True, "required": False, "allow_null": True},
            "role": {"required": False},
        }

    def get_verification_email_available(self, obj) -> bool:
        return mail_configured()

    def validate_email(self, value):
        email = value.casefold()
        matches = User.objects.filter(email__iexact=email)
        if self.instance:
            if email == self.instance.email.casefold():
                return self.instance.email
            if self.instance.email_verified:
                raise serializers.ValidationError("A verified address cannot be reassigned from user administration.")
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError("This email address is already registered.")
        return email

    def validate(self, attrs):
        request = self.context.get("request")
        instance = self.instance
        if instance and "password" in attrs:
            raise serializers.ValidationError({"password": "Use the account recovery flow to change a password."})
        if instance is None:
            if not attrs.get("password"):
                raise serializers.ValidationError({"password": "Enter an initial password."})
            try:
                password_validation.validate_password(
                    attrs["password"], User(email=attrs.get("email", ""), full_name=attrs.get("full_name", "")),
                )
            except DjangoValidationError as error:
                raise serializers.ValidationError({"password": error.messages}) from error
        if instance and not instance.email_verified and attrs.get("is_active"):
            raise serializers.ValidationError({"is_active": "Verify the email address before enabling this account."})
        if instance and instance.suspended and attrs.get("is_active", False):
            raise serializers.ValidationError({"is_active": "Reactivate this suspended user from Platform Administration."})
        if "role" in attrs and "managed_role" not in attrs:
            attrs["managed_role"] = None
        managed_role = attrs.get("managed_role", instance.managed_role if instance else None)
        if "managed_role" in attrs and managed_role:
            if "role" in attrs and attrs["role"] != managed_role.base_role:
                raise serializers.ValidationError({"role": "Role must match the selected permission level."})
            attrs["role"] = managed_role.base_role

        role = attrs.get("role", instance.role if instance else None)
        tenant = attrs.get("tenant", instance.tenant if instance else None)
        if request and not request.user.is_platform_admin:
            if role == "platform_admin":
                raise serializers.ValidationError({"role": "Only Platform Admins can assign this role."})
            if "tenant" in attrs and tenant != request.user.tenant:
                raise serializers.ValidationError({"tenant": "Choose your own organization."})
            tenant = request.user.tenant
        if not role:
            raise serializers.ValidationError({"role": "Choose a role."})
        if role == "platform_admin" and tenant:
            raise serializers.ValidationError({"tenant": "Platform Admins have no organization."})
        if role != "platform_admin" and not tenant:
            raise serializers.ValidationError({"tenant": "Choose an organization for this role."})
        if request and instance == request.user and (
            role != instance.role or tenant != instance.tenant
            or attrs.get("is_active", instance.is_active) != instance.is_active
        ):
            raise serializers.ValidationError({"role": "You cannot change your own access."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop("password", None)
        activate = validated_data.pop("is_active", True)
        validated_data.update(email_verified=False, is_active=False, activate_after_verification=activate)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        if mail_configured():
            issue_code(user, "verify")
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        changed_email = validated_data.get("email", instance.email) != instance.email
        access_changed = any(validated_data.get(field, getattr(instance, field)) != getattr(instance, field)
                             for field in ("role", "tenant", "is_active"))
        if changed_email or access_changed:
            instance.session_version += 1
        if changed_email:
            activate = validated_data.get("is_active", instance.is_active or instance.activate_after_verification)
            validated_data.update(email_verified=False, is_active=False, activate_after_verification=activate)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if changed_email and mail_configured():
            issue_code(instance, "verify")
        return instance


class UserDirectorySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "full_name", "role", "is_active"]
        read_only_fields = fields


class UserMeSerializer(serializers.ModelSerializer):
    managed_role_detail = ManagedRoleSerializer(source="managed_role", read_only=True)
    tenant_detail = TenantMinimalSerializer(source="tenant", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "full_name", "role", "tenant", "tenant_detail",
            "is_active", "created_at", "managed_role_detail", "theme", "dashboard_refresh_seconds",
        ]
        read_only_fields = ["id", "email", "role", "tenant", "is_active", "created_at"]

    def update(self, instance, validated_data):
        if validated_data:
            for field, value in validated_data.items():
                setattr(instance, field, value)
            instance.save(update_fields=[*validated_data, "updated_at"])
        return instance


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    otp = serializers.RegexField(r"\A(?:[0-9]{6}|[0-9A-Fa-f]{4}(?:-[0-9A-Fa-f]{4}){3})\Z", required=False, write_only=True)

    def validate(self, attrs):
        request = self.context.get("request")
        email = attrs["email"]
        account = User.objects.filter(email__iexact=email).order_by("pk").values_list("email", flat=True).first()
        user = authenticate(request=request, username=account or email, password=attrs["password"])
        if not user:
            raise serializers.ValidationError("Invalid credentials.")
        if not user.is_active or not user.email_verified or user.suspended:
            raise serializers.ValidationError("Account is disabled.")
        if user.tenant and user.tenant.status != "active":
            raise serializers.ValidationError("Your organization account is suspended.")
        attrs["user"] = user
        return attrs


class AuditLogSerializer(serializers.Serializer):
    """Read-only serializer for AuditLog (imported from incidents to avoid circular)."""
    id = serializers.IntegerField(read_only=True)
    tenant_id = serializers.IntegerField(read_only=True, allow_null=True)
    actor_email = serializers.SerializerMethodField()
    action = serializers.CharField(read_only=True)
    entity_type = serializers.CharField(read_only=True)
    entity_id = serializers.CharField(read_only=True)
    changes = serializers.JSONField(read_only=True)
    request_id = serializers.CharField(read_only=True)
    timestamp = serializers.DateTimeField(read_only=True)

    def get_actor_email(self, obj) -> str | None:
        return obj.actor.email if obj.actor else None
