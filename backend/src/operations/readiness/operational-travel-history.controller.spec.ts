import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import { OperationalTravelHistoryController } from "./operational-travel-history.controller";

describe("OperationalTravelHistoryController", () => {
  it("is read-only and limits trip-history reads to existing Operations roles", async () => {
    const service = { list: jest.fn().mockResolvedValue({ items: [] }), find: jest.fn().mockResolvedValue({ fulfillmentId: "f-a" }) };
    const controller = new OperationalTravelHistoryController(service as never);
    await expect(controller.list({ user: { tenantId: "tenant-a" } }, { travelPackageId: "travel-a" } as never)).resolves.toEqual({ items: [] });
    await expect(controller.find({ user: { tenantId: "tenant-a" } }, "f-a")).resolves.toEqual({ fulfillmentId: "f-a" });
    expect(service.list).toHaveBeenCalledWith("tenant-a", { travelPackageId: "travel-a" });
    expect(service.find).toHaveBeenCalledWith("tenant-a", "f-a");
    expect(Reflect.getMetadata(GUARDS_METADATA, OperationalTravelHistoryController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalTravelHistoryController)).toEqual([UserRole.ADMIN, UserRole.OPERACIONES]);
  });
});
