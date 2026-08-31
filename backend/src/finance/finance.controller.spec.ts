import { ConflictException, ForbiddenException, ValidationPipe } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { Prisma, UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ROLES_KEY } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { FinanceController } from "./finance.controller";
import { RegisterPaymentDto } from "./dto/finance.dto";

describe("FinanceController", () => {
  it("registers an exact payment for only the authenticated tenant", async () => {
    const c = context();
    c.registrations.register.mockResolvedValue(payment());
    const detail = { id: "payment-a", payerDisplayName: "Payer", status: "RECEIVED", availableAmount: "123.12345", allocations: [] };
    c.reads.getPaymentDetail.mockResolvedValue(detail);

    await expect(c.controller.registerPayment(request("tenant-auth"), {
      registrationDeduplicationKey: "payment-registration-a",
      payerDisplayName: "Payer",
      currencyCode: "CRC",
      receivedAmount: "123.12345",
      receivedAt: "2026-08-31T12:00:00.000Z",
      paymentMethod: "BANK_TRANSFER",
    })).resolves.toBe(detail);

    expect(c.registrations.register).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-auth" }));
    expect((c.registrations.register.mock.calls[0][0].receivedAmount as Prisma.Decimal).toFixed()).toBe("123.12345");
    expect(c.reads.getPaymentDetail).toHaveBeenCalledWith("tenant-auth", "payment-a");
  });

  it("returns the updated payment after a partial allocation", async () => {
    const c = context();
    const updated = { id: "payment-a", status: "PARTIALLY_ALLOCATED", availableAmount: "7.00000", allocations: [] };
    c.reads.getPaymentDetail.mockResolvedValue(updated);

    await expect(c.controller.allocatePayment(request(), "payment-a", {
      allocations: [{ accountReceivableId: "ar-a", amount: "3.00000", allocationDeduplicationKey: "allocation-a" }],
    })).resolves.toBe(updated);

    expect(c.allocations.allocate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", paymentId: "payment-a" }));
    expect((c.allocations.allocate.mock.calls[0][0].allocations[0].amount as Prisma.Decimal).toFixed()).toBe("3");
    expect(c.reads.getPaymentDetail).toHaveBeenCalledWith("tenant-a", "payment-a");
  });

  it("passes multiple AR allocations through one payment command", async () => {
    const c = context();
    c.reads.getPaymentDetail.mockResolvedValue({ id: "payment-a", allocations: [] });

    await c.controller.allocatePayment(request(), "payment-a", {
      allocations: [
        { accountReceivableId: "ar-a", amount: "4.25000", allocationDeduplicationKey: "allocation-a" },
        { accountReceivableId: "ar-b", amount: "5.75000", allocationDeduplicationKey: "allocation-b" },
      ],
    });

    const command = c.allocations.allocate.mock.calls[0][0];
    expect(command.allocations).toHaveLength(2);
    expect(command.allocations.map((item: { amount: Prisma.Decimal }) => item.amount.toFixed())).toEqual(["4.25", "5.75"]);
  });

  it("reverses an allocation and returns its updated payment", async () => {
    const c = context();
    c.reads.getPaymentIdForAllocation.mockResolvedValue("payment-a");
    c.reversals.reverse.mockResolvedValue({ id: "reversal-a", paymentAllocationId: "allocation-a", reason: "Correction", reversedAt: new Date("2026-08-31T12:00:00.000Z") });
    c.reads.getPaymentDetail.mockResolvedValue({ id: "payment-a", status: "RECEIVED", allocations: [] });

    await expect(c.controller.reverseAllocation(request(), "allocation-a", {
      reversalDeduplicationKey: "reversal-key-a", reason: "Correction",
    })).resolves.toMatchObject({ reversal: { id: "reversal-a" }, payment: { id: "payment-a", status: "RECEIVED" } });

    expect(c.reads.getPaymentIdForAllocation).toHaveBeenCalledWith("tenant-a", "allocation-a");
    expect(c.reversals.reverse).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", paymentAllocationId: "allocation-a" }));
  });

  it("maps the unallocated-payment cancellation guard to conflict", async () => {
    const c = context();
    c.cancellations.cancel.mockRejectedValue(new Error("PAYMENT_CANCELLATION_NOT_ELIGIBLE"));

    await expect(c.controller.cancelPayment(request(), "payment-a")).rejects.toBeInstanceOf(ConflictException);
  });

  it("returns full updated payment detail after cancellation", async () => {
    const c = context();
    c.cancellations.cancel.mockResolvedValue({ ...payment(), status: "CANCELLED", cancelledAt: new Date("2026-08-31T12:00:00.000Z") });
    const detail = { id: "payment-a", payerDisplayName: "Payer", status: "CANCELLED", availableAmount: "123.12345", allocations: [] };
    c.reads.getPaymentDetail.mockResolvedValue(detail);

    await expect(c.controller.cancelPayment(request("tenant-auth"), "payment-a")).resolves.toBe(detail);
    expect(c.cancellations.cancel).toHaveBeenCalledWith({ tenantId: "tenant-auth", paymentId: "payment-a" });
    expect(c.reads.getPaymentDetail).toHaveBeenCalledWith("tenant-auth", "payment-a");
  });

  it("uses the established JWT and finance roles, rejecting unauthorized roles", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, FinanceController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, FinanceController)).toEqual([UserRole.ADMIN, UserRole.FACTURACION_COBROS]);
    expect(canActivate(UserRole.ADMIN, "registerPayment")).toBe(true);
    expect(canActivate(UserRole.FACTURACION_COBROS, "allocatePayment")).toBe(true);
    expect(() => canActivate(UserRole.AGENT, "registerPayment")).toThrow(ForbiddenException);
    expect(canActivate(UserRole.CONTADOR, "getPayment")).toBe(true);
  });

  it("accepts monetary JSON only as exact decimal text and rejects caller tenant fields", async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
    const valid = {
      registrationDeduplicationKey: "payment-registration-a", payerDisplayName: "Payer", currencyCode: "CRC",
      receivedAmount: "123.12345", receivedAt: "2026-08-31T12:00:00.000Z", paymentMethod: "CASH",
    };
    await expect(pipe.transform(valid, { type: "body", metatype: RegisterPaymentDto })).resolves.toBeDefined();
    await expect(pipe.transform({ ...valid, receivedAmount: 123.12345 }, { type: "body", metatype: RegisterPaymentDto })).rejects.toBeDefined();
    await expect(pipe.transform({ ...valid, tenantId: "tenant-other" }, { type: "body", metatype: RegisterPaymentDto })).rejects.toBeDefined();
  });

  it("delegates operational AR reads and balance summaries using only the authenticated tenant", async () => {
    const c = context();
    const page = { accountReceivables: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    const balance = { customerId: "customer-a", balances: [] };
    c.reads.listAccountReceivables.mockResolvedValue(page);
    c.reads.getCustomerFinancialBalance.mockResolvedValue(balance);

    await expect(c.controller.listAccountReceivables(request("tenant-auth"), { customerId: "customer-a" })).resolves.toBe(page);
    await expect(c.controller.getCustomerFinancialBalance(request("tenant-auth"), "customer-a")).resolves.toBe(balance);
    expect(c.reads.listAccountReceivables).toHaveBeenCalledWith("tenant-auth", { customerId: "customer-a" });
    expect(c.reads.getCustomerFinancialBalance).toHaveBeenCalledWith("tenant-auth", "customer-a");
  });
});

function context() {
  const registrations = { register: jest.fn() };
  const allocations = { allocate: jest.fn().mockResolvedValue(undefined) };
  const reversals = { reverse: jest.fn() };
  const cancellations = { cancel: jest.fn() };
  const reads = { paymentSummary: jest.fn((value) => ({ id: value.id, receivedAmount: value.receivedAmount.toFixed(), availableAmount: value.availableAmount.toFixed() })), getPaymentDetail: jest.fn(), getPaymentIdForAllocation: jest.fn(), getAccountReceivableDetail: jest.fn(), listAccountReceivables: jest.fn(), getCustomerFinancialBalance: jest.fn() };
  return { registrations, allocations, reversals, cancellations, reads, controller: new FinanceController(registrations as never, allocations as never, reversals as never, cancellations as never, reads as never) };
}

function request(tenantId = "tenant-a") {
  return { user: { tenantId, role: UserRole.ADMIN } };
}

function payment() {
  return { id: "payment-a", status: "RECEIVED", currencyCode: "CRC", receivedAmount: new Prisma.Decimal("123.12345"), availableAmount: new Prisma.Decimal("123.12345"), receivedAt: new Date("2026-08-31T12:00:00.000Z"), cancelledAt: null };
}

function canActivate(role: UserRole, handler: keyof FinanceController) {
  const guard = new RolesGuard(new Reflector());
  return guard.canActivate({
    getHandler: () => FinanceController.prototype[handler],
    getClass: () => FinanceController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as never);
}
