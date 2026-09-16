import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { RolesGuard } from "../auth/roles.guard";
import { BillingController } from "./billing.controller";

describe("BillingController readonly accountant authorization", () => {
  const legacyMutationHandlers = [
    "bootstrapContractBilling",
    "sendAccountStatementEmail",
    "reportPayment",
    "markPaymentInReview",
    "sendCreditNoteEmail",
    "createCreditNote",
    "verifyPayment",
    "rejectPayment",
    "approveAndSendReceipt",
  ] as const;

  const legacyReadHandlers = [
    "listContracts",
    "getContractAccount",
    "getInvoicePdfUrl",
    "getAccountStatementPdfUrl",
    "getPaymentAttachment",
    "getReceiptPdfUrl",
    "getCreditNotePdfUrl",
  ] as const;

  it.each(legacyMutationHandlers)("does not allow CONTADOR to %s", (handler) => {
    expect(() => canActivate(UserRole.CONTADOR, handler)).toThrow(ForbiddenException);
  });

  it("keeps ADMIN legacy operations while removing the hidden legacy workspace from FACTURACION_COBROS", () => {
    for (const handler of legacyMutationHandlers) {
      expect(canActivate(UserRole.ADMIN, handler)).toBe(true);
      expect(() => canActivate(UserRole.FACTURACION_COBROS, handler)).toThrow(ForbiddenException);
    }
    expect(canActivate(UserRole.AGENT, "reportPayment")).toBe(true);
    expect(canActivate(UserRole.AGENT, "approveAndSendReceipt")).toBe(true);
  });

  it("blocks CONTADOR and FACTURACION_COBROS from direct legacy account-statement reads", () => {
    for (const handler of legacyReadHandlers) {
      expect(() => canActivate(UserRole.CONTADOR, handler)).toThrow(ForbiddenException);
      expect(() => canActivate(UserRole.FACTURACION_COBROS, handler)).toThrow(ForbiddenException);
      expect(canActivate(UserRole.ADMIN, handler)).toBe(true);
      expect(canActivate(UserRole.AGENT, handler)).toBe(true);
    }
  });

  it("keeps legacy reports ADMIN-only until their replacement is available", () => {
    expect(canActivate(UserRole.ADMIN, "getAdminReports")).toBe(true);
    for (const role of [UserRole.CONTADOR, UserRole.FACTURACION_COBROS, UserRole.AGENT]) {
      expect(() => canActivate(role, "getAdminReports")).toThrow(ForbiddenException);
    }
  });

  it("keeps dashboard metrics ADMIN-only", () => {
    expect(canActivate(UserRole.ADMIN, "getDashboardMetrics")).toBe(true);
    for (const role of [UserRole.CONTADOR, UserRole.FACTURACION_COBROS, UserRole.AGENT]) {
      expect(() => canActivate(role, "getDashboardMetrics")).toThrow(ForbiddenException);
    }
  });

  it("keeps Billing audit ADMIN-only", () => {
    expect(canActivate(UserRole.ADMIN, "listAudit")).toBe(true);
    for (const role of [UserRole.CONTADOR, UserRole.FACTURACION_COBROS, UserRole.AGENT]) {
      expect(() => canActivate(role, "listAudit")).toThrow(ForbiddenException);
    }
  });

  function canActivate(role: UserRole, handler: keyof BillingController) {
    return new RolesGuard(new Reflector()).canActivate({
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      getHandler: () => BillingController.prototype[handler],
      getClass: () => BillingController,
    } as never);
  }
});
