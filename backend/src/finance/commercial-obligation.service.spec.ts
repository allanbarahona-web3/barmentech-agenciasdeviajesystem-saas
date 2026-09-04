import {
  CommercialObligationStatus,
  Prisma,
} from "@prisma/client";
import {
  COMMERCIAL_OBLIGATION_ERRORS,
  CommercialObligationService,
} from "./commercial-obligation.service";

const actor = { userId: "reviewer-1", name: "Reviewer" };
const dueDate = new Date("2026-12-10T00:00:00.000Z");

describe("CommercialObligationService", () => {
  it("creates and audits one generic obligation without allocating a Payment", async () => {
    const winner = obligation();
    const c = context([null, winner], 1);

    const result = await c.service.createInTransaction(c.tx as never, command());

    expect(result).toEqual({ obligation: winner, created: true });
    expect(c.tx.commercialObligation.createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        customerId: "customer-1",
        sourceType: "CONTRACT",
        sourceId: "contract-1",
        sourceReference: "CT-1",
        currencyCode: "USD",
        originalAmount: expect.any(Prisma.Decimal),
        outstandingAmount: expect.any(Prisma.Decimal),
        dueDate,
        status: CommercialObligationStatus.OPEN,
        settledAt: null,
      }),
      skipDuplicates: true,
    });
    const data = c.tx.commercialObligation.createMany.mock.calls[0][0].data;
    expect(data.originalAmount.toFixed()).toBe("1000");
    expect(data.outstandingAmount.toFixed()).toBe("1000");
    expect(c.tx.billingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "FINANCE_COMMERCIAL_OBLIGATION",
          action: "CREATED",
        }),
      }),
    );
    expect((c.tx as Record<string, unknown>).commercialObligationAllocation).toBeUndefined();
  });

  it("reuses an exact existing obligation without resetting mutable balances", async () => {
    const existing = obligation({
      outstandingAmount: new Prisma.Decimal("700"),
      status: CommercialObligationStatus.PARTIALLY_SETTLED,
    });
    const c = context([existing], 0);

    await expect(
      c.service.createInTransaction(c.tx as never, command()),
    ).resolves.toEqual({ obligation: existing, created: false });

    expect(c.tx.commercialObligation.createMany).not.toHaveBeenCalled();
    expect(c.tx.billingAuditLog.create).not.toHaveBeenCalled();
  });

  it("accepts the exact concurrent winner after a skipped duplicate insert", async () => {
    const winner = obligation();
    const c = context([null, winner], 0);

    await expect(
      c.service.createInTransaction(c.tx as never, command()),
    ).resolves.toEqual({ obligation: winner, created: false });

    expect(c.tx.commercialObligation.createMany).toHaveBeenCalledTimes(1);
    expect(c.tx.billingAuditLog.create).not.toHaveBeenCalled();
  });

  it("rejects a conflicting existing obligation for the same source", async () => {
    const c = context([
      obligation({ originalAmount: new Prisma.Decimal("999") }),
    ], 0);

    await expect(
      c.service.createInTransaction(c.tx as never, command()),
    ).rejects.toThrow(COMMERCIAL_OBLIGATION_ERRORS.CONFLICT);

    expect(c.tx.commercialObligation.createMany).not.toHaveBeenCalled();
  });

  it("rejects a customer outside the tenant before persistence", async () => {
    const c = context([null], 0, false);

    await expect(
      c.service.createInTransaction(c.tx as never, command()),
    ).rejects.toThrow(COMMERCIAL_OBLIGATION_ERRORS.CUSTOMER_INVALID);

    expect(c.tx.commercialObligation.createMany).not.toHaveBeenCalled();
  });
});

function command() {
  return {
    tenantId: "tenant-1",
    customerId: "customer-1",
    sourceType: "CONTRACT",
    sourceId: "contract-1",
    sourceReference: "CT-1",
    currencyCode: "USD",
    originalAmount: new Prisma.Decimal("1000"),
    dueDate,
    actor,
  };
}

function obligation(overrides: Record<string, unknown> = {}) {
  return {
    id: "obligation-1",
    tenantId: "tenant-1",
    customerId: "customer-1",
    sourceType: "CONTRACT",
    sourceId: "contract-1",
    sourceReference: "CT-1",
    currencyCode: "USD",
    originalAmount: new Prisma.Decimal("1000"),
    outstandingAmount: new Prisma.Decimal("1000"),
    dueDate,
    status: CommercialObligationStatus.OPEN,
    createdAt: new Date("2026-09-04T12:00:00.000Z"),
    updatedAt: new Date("2026-09-04T12:00:00.000Z"),
    settledAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

function context(
  findResults: Array<ReturnType<typeof obligation> | null>,
  insertedCount: number,
  customerExists = true,
) {
  const tx = {
    commercialObligation: {
      findUnique: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: insertedCount }),
    },
    client: {
      findFirst: jest.fn().mockResolvedValue(customerExists ? { id: "customer-1" } : null),
    },
    billingAuditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  for (const result of findResults) {
    tx.commercialObligation.findUnique.mockResolvedValueOnce(result);
  }
  return { service: new CommercialObligationService(), tx };
}
