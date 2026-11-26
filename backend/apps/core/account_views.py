"""Public account recovery and authenticated security settings."""
from datetime import timedelta

import pyotp
from django.contrib.auth import logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .account_security import MailUnavailable, audit_auth, cipher, consume_code, consume_recovery_code, generate_recovery_codes, issue_code, mail_configured, matching_totp_step, queue_mail, rate_limit
from .models import User


class AddressInput(serializers.Serializer):
    email = serializers.EmailField(max_length=254)


class CodeInput(AddressInput):
    code = serializers.RegexField(r"\A[0-9]{8}\Z")


class ResetInput(CodeInput):
    password = serializers.CharField(min_length=8, max_length=128, trim_whitespace=False, write_only=True)


class CodeDelivery(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    purpose = "reset"

    @extend_schema(request=AddressInput, responses={202: OpenApiTypes.OBJECT})
    @method_decorator(csrf_protect)
    def post(self, request):
        serializer = AddressInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        rate_limit(request, self.purpose + ".delivery", email, limit=3, ip_limit=25)
        if not mail_configured():
            raise MailUnavailable()
        with transaction.atomic():
            user = User.objects.select_for_update(of=("self",)).select_related("tenant").filter(email__iexact=email).order_by("pk").first()
            accessible = user and not user.suspended and (not user.tenant or user.tenant.status == "active")
            if accessible and ((self.purpose == "verify" and not user.email_verified) or
                               (self.purpose == "reset" and user.email_verified and user.is_active)):
                issue_code(user, self.purpose)
                audit_auth(request, "code_queued", user)
        return Response({"message": "If the account is eligible, OmniEdge will email a code."}, status=202)


class VerifyDelivery(CodeDelivery):
    purpose = "verify"


class CodeConfirmation(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    purpose = "reset"
    input_class = ResetInput

    @extend_schema(request=ResetInput, responses=OpenApiTypes.OBJECT)
    @method_decorator(csrf_protect)
    def post(self, request):
        return self.check_submission(request)

    def check_submission(self, request):
        serializer = self.input_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        rate_limit(request, self.purpose + ".verify", data["email"], limit=10, ip_limit=50)
        return self.confirm(request, data)

    @transaction.atomic
    def confirm(self, request, data):
        user = User.objects.select_for_update(of=("self",)).select_related("tenant").filter(email__iexact=data["email"]).order_by("pk").first()
        allowed = user and not user.suspended and (not user.tenant or user.tenant.status == "active")
        if self.purpose == "reset":
            try:
                validate_password(data["password"])
            except DjangoValidationError as error:
                raise ValidationError({"password": error.messages}) from error
        eligible = allowed and (user.email_verified and user.is_active if self.purpose == "reset" else not user.email_verified)
        if not eligible or not consume_code(user, self.purpose, data["code"]):
            audit_auth(request, "code_rejected")
            return Response({"message": "The code is invalid or expired."}, status=400)
        if self.purpose == "reset":
            try:
                validate_password(data["password"], user)
            except DjangoValidationError as error:
                raise ValidationError({"password": error.messages}) from error
            user.set_password(data["password"])
            user.save(update_fields=["password", "updated_at"])
            queue_mail(user, "Your OmniEdge password changed",
                       "Your OmniEdge password was changed and existing sessions were ended. "
                       "If this was unexpected, contact your organization administrator immediately.",
                       timezone.now() + timedelta(days=1))
            audit_auth(request, "password_reset", user)
            return Response({"message": "Password updated. Sign in with your new password."})
        user.email_verified = True
        user.is_active = user.activate_after_verification
        user.activate_after_verification = False
        user.save(update_fields=["email_verified", "is_active", "activate_after_verification", "updated_at"])
        queue_mail(user, "Welcome to OmniEdge",
                   f"Hello {user.full_name or 'there'},\n\nYour OmniEdge email is verified. "
                   "Use your organization's OmniEdge sign-in page to get started. "
                   "For help with access, contact your organization administrator.\n\nOmniEdge Security",
                   timezone.now() + timedelta(days=1))
        audit_auth(request, "email_verified", user)
        return Response({"message": "Email verified."})


class VerifyConfirmation(CodeConfirmation):
    purpose = "verify"
    input_class = CodeInput

    @extend_schema(request=CodeInput, responses=OpenApiTypes.OBJECT)
    @method_decorator(csrf_protect)
    def post(self, request):
        return self.check_submission(request)


class MFAInput(serializers.Serializer):
    action = serializers.ChoiceField(choices=("start", "enable", "disable"))
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    code = serializers.RegexField(r"\A(?:[0-9]{6}|[0-9A-Fa-f]{4}(?:-[0-9A-Fa-f]{4}){3})\Z", required=False)


class AccountSecurityView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response({"mfa_enabled": bool(request.user.mfa_secret)})

    @extend_schema(request=MFAInput, responses=OpenApiTypes.OBJECT)
    @transaction.atomic
    def post(self, request):
        serializer = MFAInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        rate_limit(request, "mfa.settings", str(request.user.pk))
        user = User.objects.select_for_update().get(pk=request.user.pk)
        if not user.check_password(data["password"]):
            return Response({"message": "Check your password and try again."}, status=400)
        action = data["action"]
        if action == "start":
            if user.mfa_secret:
                raise ValidationError({"action": "Disable the existing authenticator first."})
            secret = pyotp.random_base32()
            request.session["mfa_enrollment"] = {
                "secret": cipher().encrypt(secret.encode()).decode(),
                "expires": (timezone.now() + timedelta(minutes=10)).timestamp(),
            }
            return Response({"setup_key": secret})
        pending = request.session.get("mfa_enrollment", {})
        if action == "enable":
            if user.mfa_secret or pending.get("expires", 0) <= timezone.now().timestamp():
                raise ValidationError({"action": "Start a new authenticator enrollment."})
            encrypted = pending["secret"]
        else:
            if not user.mfa_secret:
                raise ValidationError({"action": "There is no enabled authenticator."})
            encrypted = user.mfa_secret
        secret = cipher().decrypt(encrypted.encode()).decode()
        step = matching_totp_step(secret, data.get("code"), user.mfa_last_step if action == "disable" else -1)
        if step is None and not (action == "disable" and consume_recovery_code(user, data.get("code"))):
            audit_auth(request, "mfa_rejected", user)
            return Response({"message": "Enter a fresh code from your authenticator."}, status=400)
        user.mfa_secret = encrypted if action == "enable" else ""
        user.mfa_last_step = step if action == "enable" else -1
        codes = generate_recovery_codes(user) if action == "enable" else []
        if action == "disable":
            user.mfa_recovery = []
        user.session_version += 1
        user.save(update_fields=["mfa_secret", "mfa_last_step", "mfa_recovery", "session_version"])
        request.session.pop("mfa_enrollment", None)
        update_session_auth_hash(request, user)
        audit_auth(request, f"mfa_{'enabled' if user.mfa_secret else 'disabled'}", user)
        return Response({"mfa_enabled": bool(user.mfa_secret), "recovery_codes": codes})

    @extend_schema(request=None, responses={204: None})
    @transaction.atomic
    def delete(self, request):
        user = User.objects.select_for_update().get(pk=request.user.pk)
        user.session_version += 1
        user.save(update_fields=["session_version"])
        audit_auth(request, "sessions_revoked", user)
        logout(request)
        return Response(status=204)
