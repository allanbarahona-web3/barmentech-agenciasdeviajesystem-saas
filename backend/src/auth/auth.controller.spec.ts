import { GUARDS_METADATA } from "@nestjs/common/constants";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { ROLES_KEY } from "./roles.decorator";
import { RolesGuard } from "./roles.guard";
import { AuthController } from "./auth.controller";

describe("AuthController tenant users", () => {
  it("reuses the tenant-scoped user directory for ADMIN and OPERACIONES", () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AuthController.prototype.adminUsers);
    expect(roles).toEqual(["ADMIN", "OPERACIONES"]);
    expect(Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.adminUsers)).toEqual([JwtAuthGuard, RolesGuard]);
  });

  it("passes only the authenticated tenant to the shared user listing", async () => {
    const authService = { adminListUsers: jest.fn().mockResolvedValue([]) };
    const controller = new AuthController(authService as never);
    await controller.adminUsers({ user: { tenantId: "tenant-a" } });
    expect(authService.adminListUsers).toHaveBeenCalledWith("tenant-a");
  });
});
