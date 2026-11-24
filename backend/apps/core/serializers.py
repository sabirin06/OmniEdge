"""
Core serializers: Tenant, User, AuditLog.
"""
from django.contrib.auth import authenticate, password_validation
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

    def get_user_count(self, obj):
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
    tenant_detail = TenantMinimalSerializer(source="tenant", read_only=True)
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    managed_role_detail = ManagedRoleSerializer(source="managed_role", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "full_name", "role", "tenant", "tenant_detail",
            "is_active", "created_at", "updated_at", "password",
            "managed_role", "managed_role_detail",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            "tenant": {"write_only": True, "required": False, "allow_null": True},
            "role": {"required": False},
        }

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        instance = self.instance
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

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class UserMeSerializer(serializers.ModelSerializer):
    managed_role_detail = ManagedRoleSerializer(source="managed_role", read_only=True)
    tenant_detail = TenantMinimalSerializer(source="tenant", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "full_name", "role", "tenant", "tenant_detail",
            "is_active", "created_at", "managed_role_detail",
        ]
        read_only_fields = ["id", "email", "role", "tenant", "created_at"]


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        request = self.context.get("request")
        user = authenticate(request=request, username=attrs["email"], password=attrs["password"])
        if not user:
            raise serializers.ValidationError("Invalid credentials.")
        if not user.is_active:
            raise serializers.ValidationError("Account is disabled.")
        if user.tenant and user.tenant.status == "suspended":
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

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor else None
