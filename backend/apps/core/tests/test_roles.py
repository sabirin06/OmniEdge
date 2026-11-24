from django.test import TestCase

from rest_framework.test import APIClient

from apps.core.models import ManagedRole, Tenant, User


class ManagedRoleTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.horizon = Tenant.objects.create(name="Horizon Bank", code="HORIZON")
        atlas = Tenant.objects.create(name="Atlas Finance", code="ATLAS")
        cls.platform = User.objects.create(email="platform@example.com", role="platform_admin")
        cls.customer = User.objects.create(email="customer@example.com", role="customer_admin", tenant=cls.horizon)
        cls.analyst = User.objects.create(email="analyst@example.com", role="soc_analyst", tenant=cls.horizon)
        cls.outside = User.objects.create(email="outside@example.com", role="soc_analyst", tenant=atlas)

    def setUp(self):
        self.client = APIClient()

    def test_platform_creates_assigns_and_renames_role(self):
        self.client.force_authenticate(self.platform)
        response = self.client.post("/api/v1/roles/", {"name": "Shift Lead", "base_role": "soc_lead"})
        self.assertEqual(response.status_code, 201, response.data)
        role_id = response.data["id"]
        create = self.client.post("/api/v1/users/", {
            "email": "new@example.com",
            "full_name": "New Lead",
            "managed_role": role_id,
            "tenant": self.horizon.id,
            "password": "Example!NewSide48",
        })
        self.assertEqual(create.status_code, 201, create.data)
        self.assertEqual(create.data["role"], "soc_lead")

        user_url = f"/api/v1/users/{self.analyst.id}/"
        assigned = self.client.patch(user_url, {"managed_role": role_id})
        self.assertEqual(assigned.status_code, 200, assigned.data)
        self.analyst.refresh_from_db()
        self.assertEqual(self.analyst.role, "soc_lead")
        self.assertEqual(self.analyst.managed_role_id, role_id)

        role_url = f"/api/v1/roles/{role_id}/"
        self.assertEqual(self.client.patch(role_url, {"name": "Night Shift Lead"}).status_code, 200)
        self.assertEqual(self.client.patch(role_url, {"base_role": "platform_admin"}).status_code, 400)
        self.assertEqual(self.client.get(user_url).data["managed_role_detail"]["name"], "Night Shift Lead")
        self.assertEqual(self.client.patch(user_url, {"role": "soc_analyst"}).status_code, 200)
        self.analyst.refresh_from_db()
        self.assertIsNone(self.analyst.managed_role_id)

    def test_only_admins_can_assign_roles_within_their_scope(self):
        global_role = ManagedRole.objects.create(name="Platform Operator", base_role="platform_admin")
        tenant_role = ManagedRole.objects.create(name="Shift Lead", base_role="soc_lead")
        analyst_url = f"/api/v1/users/{self.analyst.id}/"
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.post("/api/v1/roles/", {"name": "Operator", "base_role": "soc_lead"}).status_code, 403)
        self.assertEqual([role["id"] for role in self.client.get("/api/v1/roles/").data], [tenant_role.id])
        self.assertEqual(self.client.patch(analyst_url, {"managed_role": global_role.id}).status_code, 400)
        self.assertEqual(self.client.patch(analyst_url, {"managed_role": tenant_role.id}).status_code, 200)
        self.assertEqual(self.client.patch(f"/api/v1/users/{self.outside.id}/", {"managed_role": tenant_role.id}).status_code, 404)

        self.client.force_authenticate(self.analyst)
        self.assertEqual(self.client.get("/api/v1/roles/").status_code, 403)
        self.assertEqual(self.client.patch(analyst_url, {"managed_role": tenant_role.id}).status_code, 403)
