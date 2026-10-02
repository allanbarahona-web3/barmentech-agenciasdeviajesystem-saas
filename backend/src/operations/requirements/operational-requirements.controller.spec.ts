import { ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../../auth/roles.decorator";
import { RolesGuard } from "../../auth/roles.guard";
import {
  UpdateOperationalRequirementDto,
} from "./dto/operational-requirements.dto";
import { OperationalRequirementsController } from "./operational-requirements.controller";

describe("OperationalRequirementsController", () => {
  it("allows AGENT reads while exposing only lifecycle-safe requirement mutations", async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OperationalRequirementsController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, OperationalRequirementsController)).toEqual([
      UserRole.ADMIN, UserRole.OPERACIONES, UserRole.AGENT,
    ]);
    for (const method of ["update", "transitionStatus"] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, OperationalRequirementsController.prototype[method]))
        .toEqual([UserRole.ADMIN, UserRole.OPERACIONES]);
    }
    expect(Object.prototype.hasOwnProperty.call(OperationalRequirementsController.prototype, "create")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(OperationalRequirementsController.prototype, "addPassengers")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(OperationalRequirementsController.prototype, "removePassengers")).toBe(false);

  });

  it("keeps the remaining update input bounded and rejects forged persistence fields", async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const metadata = { type: "body" as const, data: "" };
    await expect(pipe.transform({
      critical: true, tenantId: "forged",
    }, { ...metadata, metatype: UpdateOperationalRequirementDto })).rejects.toThrow();
    await expect(pipe.transform({ status: "FULFILLED" }, {
      ...metadata, metatype: UpdateOperationalRequirementDto,
    })).rejects.toThrow();
  });
});

function serviceMock() {
  return {
    list: jest.fn(), find: jest.fn(), update: jest.fn(), transitionStatus: jest.fn(),
  };
}
