import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { RolesGuard } from "../auth/roles.guard";
import { ContractsController } from "./contracts.controller";

describe("ContractsController history authorization", () => {
  it("keeps Historial for existing operational/admin roles and rejects CONTADOR and FACTURACION_COBROS", () => {
    for (const role of [UserRole.ADMIN, UserRole.AGENT, UserRole.OPERACIONES, UserRole.VENTAS]) {
      expect(canActivate(role)).toBe(true);
    }

    expect(() => canActivate(UserRole.CONTADOR)).toThrow(ForbiddenException);
    expect(() => canActivate(UserRole.FACTURACION_COBROS)).toThrow(ForbiddenException);
  });

  function canActivate(role: UserRole) {
    return new RolesGuard(new Reflector()).canActivate({
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      getHandler: () => ContractsController.prototype.getContractHistory,
      getClass: () => ContractsController,
    } as never);
  }
});
