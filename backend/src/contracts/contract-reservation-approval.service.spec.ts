import {
  PaymentConditionType,
  PriceTaxTreatment,
  Prisma,
} from "@prisma/client";
import {
  COMMERCIAL_OBLIGATION_ERRORS,
  CommercialObligationError,
} from "../finance/commercial-obligation.service";
import { ContractReservationApprovalService } from "./contract-reservation-approval.service";

const actor = { userId: "reviewer-1", name: "Reviewer" };
const approvalInput = {
  tenantId: "tenant-1",
  contractId: "contract-1",
  actor,
};

describe("ContractReservationApprovalService", () => {
  it("transitions a tenant-owned international reservation, creates its roster, and closes full capacity", async () => {
    const c = context({ travelPackageId: "package-1", internalTripId: null });
    c.tx.travelPackage.findFirst.mockResolvedValue({ capacity: 2, occupiedSlots: 1, name: "Peru" });
    c.tx.travelPackage.update
      .mockResolvedValueOnce({ capacity: 2, occupiedSlots: 2, status: "OPEN" })
      .mockResolvedValueOnce({ capacity: 2, occupiedSlots: 2, status: "CLOSED" });

    await expect(c.service.approveInTransaction(c.tx as never, approvalInput)).resolves.toEqual({ applied: true, commercialObligationId: "obligation-1" });

    expect(c.tx.contract.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "contract-1", tenantId: "tenant-1" } }));
    expect(c.tx.contract.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-1" }), data: { status: "PENDING_SIGNATURE" } }));
    expect(c.participants.findClients).toHaveBeenCalledWith(c.tx, "tenant-1", ["customer-1"]);
    expect(c.participants.createMany).toHaveBeenCalledWith(c.tx, [{ tenantId: "tenant-1", travelPackageId: "package-1", clientId: "customer-1", role: "HOLDER" }]);
    expect(c.tx.travelPackage.update).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: { occupiedSlots: { increment: 1 } } }));
    expect(c.tx.travelPackage.update).toHaveBeenNthCalledWith(2, { where: { id: "package-1" }, data: { status: "CLOSED" } });
    expect(c.commercialObligations.createInTransaction).toHaveBeenCalledWith(c.tx, {
      tenantId: "tenant-1",
      customerId: "customer-1",
      sourceType: "CONTRACT",
      sourceId: "contract-1",
      sourceReference: "CT-1",
      currencyCode: "USD",
      originalAmount: expect.any(Prisma.Decimal),
      dueDate: null,
      actor,
    });
    expect(c.commercialObligations.createInTransaction.mock.invocationCallOrder[0])
      .toBeLessThan(c.tx.contract.updateMany.mock.invocationCallOrder[0]);
  });

  it("preserves internal-trip capacity effects without creating an international roster", async () => {
    const c = context({ travelPackageId: null, internalTripId: "trip-1", participantCount: 2 });
    c.tx.internalTrip.findFirst.mockResolvedValue({ capacity: 4, occupiedSlots: 1, name: "Guanacaste" });
    c.tx.internalTrip.update.mockResolvedValue({ capacity: 4, occupiedSlots: 3, status: "OPEN" });

    await c.service.approveInTransaction(c.tx as never, approvalInput);

    expect(c.tx.internalTrip.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "trip-1", tenantId: "tenant-1" } }));
    expect(c.tx.internalTrip.update).toHaveBeenCalledWith(expect.objectContaining({ data: { occupiedSlots: { increment: 2 } } }));
    expect(c.participants.createMany).not.toHaveBeenCalled();
  });

  it("runs the commercial allocation hook after obligation creation and before PENDING_SIGNATURE", async () => {
    const c = context();
    const afterCommercialObligation = jest.fn().mockResolvedValue(undefined);

    await c.service.approveInTransaction(c.tx as never, {
      ...approvalInput,
      afterCommercialObligation,
    });

    expect(afterCommercialObligation).toHaveBeenCalledWith({ commercialObligationId: "obligation-1" });
    expect(c.commercialObligations.createInTransaction.mock.invocationCallOrder[0])
      .toBeLessThan(afterCommercialObligation.mock.invocationCallOrder[0]);
    expect(afterCommercialObligation.mock.invocationCallOrder[0])
      .toBeLessThan(c.tx.contract.updateMany.mock.invocationCallOrder[0]);
  });

  it("is idempotent after the Contract has reached PENDING_SIGNATURE", async () => {
    const c = context({ status: "PENDING_SIGNATURE", travelPackageId: "package-1" });
    await expect(c.service.approveInTransaction(c.tx as never, approvalInput)).resolves.toEqual({ applied: false, commercialObligationId: null });
    expect(c.tx.contract.updateMany).not.toHaveBeenCalled();
    expect(c.tx.travelPackage.update).not.toHaveBeenCalled();
    expect(c.participants.createMany).not.toHaveBeenCalled();
    expect(c.commercialObligations.createInTransaction).not.toHaveBeenCalled();
  });

  it("rejects participant identities that do not resolve inside the Contract tenant", async () => {
    const c = context({ travelPackageId: "package-1", payload: { companions: [{ fullName: "Guest", idNumber: "2", selectedCustomerId: "other-tenant-customer" }] } });
    c.tx.travelPackage.findFirst.mockResolvedValue({ capacity: 3, occupiedSlots: 0, name: "Peru" });
    c.participants.findClients.mockResolvedValue([{ id: "customer-1" }]);
    await expect(c.service.approveInTransaction(c.tx as never, approvalInput)).rejects.toThrow("CONTRACT_RESERVATION_PARTICIPANT_TENANT_INVALID");
    expect(c.tx.travelPackage.update).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null])(
    "rejects invalid participantCount %p before any Contract or Travel mutation",
    async (participantCount) => {
      const c = context({ participantCount, travelPackageId: "package-1" });
      await expect(c.service.approveInTransaction(c.tx as never, approvalInput)).rejects.toThrow("CONTRACT_RESERVATION_PARTICIPANT_COUNT_INVALID");
      expect(c.tx.contract.updateMany).not.toHaveBeenCalled();
      expect(c.tx.travelPackage.findFirst).not.toHaveBeenCalled();
      expect(c.tx.travelPackage.update).not.toHaveBeenCalled();
      expect(c.tx.internalTrip.update).not.toHaveBeenCalled();
      expect(c.participants.createMany).not.toHaveBeenCalled();
    },
  );

  it("rejects a Contract linked to both Travel contexts before any mutation", async () => {
    const c = context({ travelPackageId: "package-1", internalTripId: "trip-1" });
    await expect(c.service.approveInTransaction(c.tx as never, approvalInput)).rejects.toThrow("CONTRACT_RESERVATION_TRAVEL_CONTEXT_CONFLICT");
    expect(c.tx.contract.updateMany).not.toHaveBeenCalled();
    expect(c.tx.travelPackage.findFirst).not.toHaveBeenCalled();
    expect(c.tx.internalTrip.findFirst).not.toHaveBeenCalled();
    expect(c.tx.travelPackage.update).not.toHaveBeenCalled();
    expect(c.tx.internalTrip.update).not.toHaveBeenCalled();
    expect(c.participants.createMany).not.toHaveBeenCalled();
  });

  it("blocks an approvable legacy Contract with incomplete commercial authority", async () => {
    const c = context({ commercialTotal: null, commercialCurrency: null });

    await expect(
      c.service.approveInTransaction(c.tx as never, approvalInput),
    ).rejects.toThrow("CONTRACT_COMMERCIAL_TERMS_INCOMPLETE");

    expect(c.commercialObligations.createInTransaction).not.toHaveBeenCalled();
    expect(c.tx.contract.updateMany).not.toHaveBeenCalled();
  });

  it("fails safely when the source already has a conflicting obligation", async () => {
    const c = context();
    c.commercialObligations.createInTransaction.mockRejectedValueOnce(
      new CommercialObligationError(COMMERCIAL_OBLIGATION_ERRORS.CONFLICT),
    );

    await expect(
      c.service.approveInTransaction(c.tx as never, approvalInput),
    ).rejects.toThrow(COMMERCIAL_OBLIGATION_ERRORS.CONFLICT);

    expect(c.tx.contract.updateMany).not.toHaveBeenCalled();
    expect((c.tx as Record<string, unknown>).commercialObligationAllocation).toBeUndefined();
  });
});

function context(overrides: Record<string, unknown> = {}) {
  const contract = {
    id: "contract-1", tenantId: "tenant-1", clientId: "customer-1",
    contractNumber: "CT-1", status: "PENDING_PAYMENT_RESERVE", participantCount: 1,
    travelPackageId: null, internalTripId: null, payload: {},
    commercialTotal: new Prisma.Decimal("1000"), commercialCurrency: "USD",
    paymentConditionType: PaymentConditionType.CASH, paymentDueDate: null,
    commercialTaxTreatment: PriceTaxTreatment.TAX_INCLUDED,
    ...overrides,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: "locked" }]),
    contract: { findFirst: jest.fn().mockResolvedValue(contract), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    travelPackage: { findFirst: jest.fn(), update: jest.fn() },
    internalTrip: { findFirst: jest.fn(), update: jest.fn() },
  };
  const participants = {
    findClients: jest.fn().mockResolvedValue([{ id: "customer-1" }]),
    createMany: jest.fn().mockResolvedValue(undefined),
  };
  const commercialObligations = {
    createInTransaction: jest.fn().mockResolvedValue({
      obligation: { id: "obligation-1" },
      created: true,
    }),
  };
  return {
    service: Reflect.construct(ContractReservationApprovalService, [participants, commercialObligations]),
    tx,
    participants,
    commercialObligations,
  };
}
