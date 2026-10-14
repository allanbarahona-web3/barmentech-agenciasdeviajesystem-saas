import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { RolesGuard } from "../auth/roles.guard";
import { BillingController } from "./billing.controller";

describe("BillingController after contract-account retirement", () => {
  it("removes the legacy contract-account read and document handlers", () => {
    for (const handler of [
      "listContracts",
      "getContractAccount",
      "getInvoicePdfUrl",
      "getAccountStatementPdfUrl",
      "getPaymentAttachment",
      "getReceiptPdfUrl",
      "getCreditNotePdfUrl",
      "sendAccountStatementEmail",
      "sendCreditNoteEmail",
    ]) {
      expect(BillingController.prototype).not.toHaveProperty(handler);
    }
  });

  it("keeps verification, rejection, and audit paths while removing pending counts", () => {
    for (const handler of ["verifyPayment", "rejectPayment", "listAudit"] as const) {
      expect(BillingController.prototype).toHaveProperty(handler);
    }
    expect(BillingController.prototype).not.toHaveProperty("getPendingCounts");
    expect(canActivate(UserRole.ADMIN, "verifyPayment")).toBe(true);
    expect(() => canActivate(UserRole.AGENT, "verifyPayment")).toThrow(ForbiddenException);
    expect(canActivate(UserRole.ADMIN, "listAudit")).toBe(true);
    expect(() => canActivate(UserRole.AGENT, "listAudit")).toThrow(ForbiddenException);
  });

  it("keeps the obsolete dashboard-metrics handler removed", () => {
    expect(BillingController.prototype).not.toHaveProperty("getDashboardMetrics");
  });

  function canActivate(role: UserRole, handler: keyof BillingController) {
    return new RolesGuard(new Reflector()).canActivate({
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      getHandler: () => BillingController.prototype[handler],
      getClass: () => BillingController,
    } as never);
  }
});
