import { ContractReservationApprovalService } from "./contract-reservation-approval.service";

describe("ContractReservationApprovalService", () => {
  it("transitions a tenant-owned international reservation, creates its roster, and closes full capacity", async () => {
    const c = context({ travelPackageId: "package-1", internalTripId: null });
    c.tx.travelPackage.findFirst.mockResolvedValue({ capacity: 2, occupiedSlots: 1, name: "Peru" });
    c.tx.travelPackage.update
      .mockResolvedValueOnce({ capacity: 2, occupiedSlots: 2, status: "OPEN" })
      .mockResolvedValueOnce({ capacity: 2, occupiedSlots: 2, status: "CLOSED" });

    await expect(c.service.approveInTransaction(c.tx as never, { tenantId: "tenant-1", contractId: "contract-1" })).resolves.toEqual({ applied: true });

    expect(c.tx.contract.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "contract-1", tenantId: "tenant-1" } }));
    expect(c.tx.contract.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-1" }), data: { status: "PENDING_SIGNATURE" } }));
    expect(c.participants.findClients).toHaveBeenCalledWith(c.tx, "tenant-1", ["customer-1"]);
    expect(c.participants.createMany).toHaveBeenCalledWith(c.tx, [{ tenantId: "tenant-1", travelPackageId: "package-1", clientId: "customer-1", role: "HOLDER" }]);
    expect(c.tx.travelPackage.update).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: { occupiedSlots: { increment: 1 } } }));
    expect(c.tx.travelPackage.update).toHaveBeenNthCalledWith(2, { where: { id: "package-1" }, data: { status: "CLOSED" } });
  });

  it("preserves internal-trip capacity effects without creating an international roster", async () => {
    const c = context({ travelPackageId: null, internalTripId: "trip-1", participantCount: 2 });
    c.tx.internalTrip.findFirst.mockResolvedValue({ capacity: 4, occupiedSlots: 1, name: "Guanacaste" });
    c.tx.internalTrip.update.mockResolvedValue({ capacity: 4, occupiedSlots: 3, status: "OPEN" });

    await c.service.approveInTransaction(c.tx as never, { tenantId: "tenant-1", contractId: "contract-1" });

    expect(c.tx.internalTrip.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "trip-1", tenantId: "tenant-1" } }));
    expect(c.tx.internalTrip.update).toHaveBeenCalledWith(expect.objectContaining({ data: { occupiedSlots: { increment: 2 } } }));
    expect(c.participants.createMany).not.toHaveBeenCalled();
  });

  it("is idempotent after the Contract has reached PENDING_SIGNATURE", async () => {
    const c = context({ status: "PENDING_SIGNATURE", travelPackageId: "package-1" });
    await expect(c.service.approveInTransaction(c.tx as never, { tenantId: "tenant-1", contractId: "contract-1" })).resolves.toEqual({ applied: false });
    expect(c.tx.contract.updateMany).not.toHaveBeenCalled();
    expect(c.tx.travelPackage.update).not.toHaveBeenCalled();
    expect(c.participants.createMany).not.toHaveBeenCalled();
  });

  it("rejects participant identities that do not resolve inside the Contract tenant", async () => {
    const c = context({ travelPackageId: "package-1", payload: { companions: [{ fullName: "Guest", idNumber: "2", selectedCustomerId: "other-tenant-customer" }] } });
    c.tx.travelPackage.findFirst.mockResolvedValue({ capacity: 3, occupiedSlots: 0, name: "Peru" });
    c.participants.findClients.mockResolvedValue([{ id: "customer-1" }]);
    await expect(c.service.approveInTransaction(c.tx as never, { tenantId: "tenant-1", contractId: "contract-1" })).rejects.toThrow("CONTRACT_RESERVATION_PARTICIPANT_TENANT_INVALID");
    expect(c.tx.travelPackage.update).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null])(
    "rejects invalid participantCount %p before any Contract or Travel mutation",
    async (participantCount) => {
      const c = context({ participantCount, travelPackageId: "package-1" });
      await expect(c.service.approveInTransaction(c.tx as never, { tenantId: "tenant-1", contractId: "contract-1" })).rejects.toThrow("CONTRACT_RESERVATION_PARTICIPANT_COUNT_INVALID");
      expect(c.tx.contract.updateMany).not.toHaveBeenCalled();
      expect(c.tx.travelPackage.findFirst).not.toHaveBeenCalled();
      expect(c.tx.travelPackage.update).not.toHaveBeenCalled();
      expect(c.tx.internalTrip.update).not.toHaveBeenCalled();
      expect(c.participants.createMany).not.toHaveBeenCalled();
    },
  );

  it("rejects a Contract linked to both Travel contexts before any mutation", async () => {
    const c = context({ travelPackageId: "package-1", internalTripId: "trip-1" });
    await expect(c.service.approveInTransaction(c.tx as never, { tenantId: "tenant-1", contractId: "contract-1" })).rejects.toThrow("CONTRACT_RESERVATION_TRAVEL_CONTEXT_CONFLICT");
    expect(c.tx.contract.updateMany).not.toHaveBeenCalled();
    expect(c.tx.travelPackage.findFirst).not.toHaveBeenCalled();
    expect(c.tx.internalTrip.findFirst).not.toHaveBeenCalled();
    expect(c.tx.travelPackage.update).not.toHaveBeenCalled();
    expect(c.tx.internalTrip.update).not.toHaveBeenCalled();
    expect(c.participants.createMany).not.toHaveBeenCalled();
  });
});

function context(overrides: Record<string, unknown> = {}) {
  const contract = {
    id: "contract-1", tenantId: "tenant-1", clientId: "customer-1",
    status: "PENDING_PAYMENT_RESERVE", participantCount: 1,
    travelPackageId: null, internalTripId: null, payload: {}, ...overrides,
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
  return { service: Reflect.construct(ContractReservationApprovalService, [participants]), tx, participants };
}
