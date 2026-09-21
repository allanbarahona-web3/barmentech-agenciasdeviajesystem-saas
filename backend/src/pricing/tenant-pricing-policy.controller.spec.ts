import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TenantPricingPolicyController } from "./tenant-pricing-policy.controller";

describe("TenantPricingPolicyController", () => {
  it("is ADMIN-only", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TenantPricingPolicyController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, TenantPricingPolicyController)).toEqual([UserRole.ADMIN]);
  });

  it("derives tenant and audit actor from the authenticated request", async () => {
    const service = { create: jest.fn().mockResolvedValue({ id: "policy-a" }) };
    const controller = new TenantPricingPolicyController(service as never);
    const request = { user: { id: "admin-a", fullName: "Admin A", tenantId: "tenant-a" } };
    const body = { name: "Política estándar" } as never;

    await controller.create(request, body);

    expect(service.create).toHaveBeenCalledWith("tenant-a", body, {
      userId: "admin-a",
      name: "Admin A",
    });
  });
});
