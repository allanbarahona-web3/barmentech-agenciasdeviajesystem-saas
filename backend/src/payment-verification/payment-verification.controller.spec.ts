import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { RolesGuard } from "../auth/roles.guard";
import { PaymentVerificationController } from "./payment-verification.controller";

describe("PaymentVerificationController readonly accountant authorization", () => {
  it("rejects CONTADOR receipt processing while retaining the existing operational roles", () => {
    expect(() => canActivate(UserRole.CONTADOR)).toThrow(ForbiddenException);
    for (const role of [UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.AGENT]) {
      expect(canActivate(role)).toBe(true);
    }
  });

  function canActivate(role: UserRole) {
    return new RolesGuard(new Reflector()).canActivate({
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      getHandler: () => PaymentVerificationController.prototype.processReceipt,
      getClass: () => PaymentVerificationController,
    } as never);
  }
});
