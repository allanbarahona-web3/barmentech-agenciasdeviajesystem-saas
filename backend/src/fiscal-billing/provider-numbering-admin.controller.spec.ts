import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ProviderNumberingAdminController } from "./provider-numbering-admin.controller";

describe("ProviderNumberingAdminController", () => {
  it("requires JWT and ADMIN authorization", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ProviderNumberingAdminController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
    expect(
      Reflect.getMetadata(ROLES_KEY, ProviderNumberingAdminController),
    ).toEqual([UserRole.ADMIN]);
  });

  it("uses only tenant and issuer route identity without a request body", async () => {
    const service = { configureAndVerify: jest.fn().mockResolvedValue({ verified: true }) };
    const controller = new ProviderNumberingAdminController(service as never);
    await expect(
      controller.configureIntegratorMode(
        { user: { tenantId: "tenant-a", role: UserRole.ADMIN } },
        "issuer-a",
      ),
    ).resolves.toEqual({ verified: true });
    expect(service.configureAndVerify).toHaveBeenCalledWith(
      "tenant-a",
      "issuer-a",
    );
    expect(ProviderNumberingAdminController.prototype.configureIntegratorMode.length).toBe(2);
  });
});
