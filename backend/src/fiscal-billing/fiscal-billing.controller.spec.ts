import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { FiscalBillingController } from "./fiscal-billing.controller";

describe("FiscalBillingController authorization", () => {
  it("declares only ADMIN and FACTURACION_COBROS roles", () => {
    expect(Reflect.getMetadata(ROLES_KEY, FiscalBillingController)).toEqual([
      UserRole.ADMIN,
      UserRole.FACTURACION_COBROS,
    ]);
  });

  it.each([UserRole.ADMIN, UserRole.FACTURACION_COBROS])(
    "authorizes %s",
    (role) => {
      expect(canActivate(role)).toBe(true);
    },
  );

  it.each([UserRole.AGENT, UserRole.OPERACIONES])("rejects %s", (role) => {
    expect(() => canActivate(role)).toThrow(ForbiddenException);
  });
});

function canActivate(role: UserRole) {
  const guard = new RolesGuard(new Reflector());
  const context = {
    getHandler: () => FiscalBillingController.prototype.listEligible,
    getClass: () => FiscalBillingController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  };
  return guard.canActivate(context as never);
}
