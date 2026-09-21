import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { ROLES_KEY } from "../auth/roles.decorator";
import { FiscalClassificationController } from "./fiscal-classification.controller";

describe("FiscalClassificationController", () => {
  it("is ADMIN-only", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, FiscalClassificationController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, FiscalClassificationController)).toEqual([UserRole.ADMIN]);
  });

  it("derives tenant and actor only from the authenticated request", async () => {
    const service = { create: jest.fn().mockResolvedValue({ id: "classification-a" }) };
    const controller = new FiscalClassificationController(service as never);
    const request = { user: { id: "admin-a", fullName: "Admin A", tenantId: "tenant-a" } };
    const body = { displayName: "Transporte privado" } as never;

    await controller.create(request, body);

    expect(service.create).toHaveBeenCalledWith("tenant-a", body, { userId: "admin-a", name: "Admin A" });
  });
});
