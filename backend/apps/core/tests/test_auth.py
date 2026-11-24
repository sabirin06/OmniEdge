from django.test import TestCase
from rest_framework.test import APIClient
from apps.core.models import Tenant, User


class AuthAndTenantIsolationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tenant_horizon = Tenant.objects.create(name="Horizon Bank", code="HORIZON", status="active")
        self.tenant_atlas = Tenant.objects.create(name="Atlas Finance", code="ATLAS", status="active")

        self.user_horizon = User.objects.create_user(
            email="analyst@horizonbank.com",
            password="Password@123!",
            full_name="Sarah Horizon",
            role="soc_analyst",
            tenant=self.tenant_horizon,
        )
        self.user_atlas = User.objects.create_user(
            email="analyst@atlasfinance.com",
            password="Password@123!",
            full_name="Emma Atlas",
            role="soc_analyst",
            tenant=self.tenant_atlas,
        )
        self.admin = User.objects.create_user(
            email="admin@omniteckno.com",
            password="Admin@123!",
            full_name="Platform Admin",
            role="platform_admin",
            tenant=None,
            is_staff=True,
        )

    def test_login_success(self):
        res = self.client.post("/api/v1/auth/login/", {"email": "analyst@horizonbank.com", "password": "Password@123!"})
        self.assertEqual(res.status_code, 200)
        self.assertIn("user", res.data)
        self.assertEqual(res.data["user"]["email"], "analyst@horizonbank.com")

    def test_login_invalid_password(self):
        res = self.client.post("/api/v1/auth/login/", {"email": "analyst@horizonbank.com", "password": "WrongPassword"})
        self.assertEqual(res.status_code, 401)

    def test_me_authenticated(self):
        self.client.force_authenticate(user=self.user_horizon)
        res = self.client.get("/api/v1/auth/me/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["role"], "soc_analyst")
        self.assertEqual(res.data["tenant"], self.tenant_horizon.id)

    def test_health_check(self):
        res = self.client.get("/api/v1/health/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "ok")
