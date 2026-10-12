import { BadRequestException, NotFoundException } from "@nestjs/common";
import { OperationalTravelHistoryService } from "./operational-travel-history.service";

const tenantId = "tenant-a";

describe("OperationalTravelHistoryService", () => {
  it("returns only terminal Travel and Additional executions with one bounded batch per page", async () => {
    const c = context();
    c.tx.operationalFulfillment.findMany.mockResolvedValue([
      fulfillment({ id: "confirmed-a", status: "CONFIRMED" }),
      fulfillment({ id: "cancelled-b", status: "CANCELLED", operationalRequirementId: "requirement-b" }),
    ]);
    c.tx.operationalFulfillment.count.mockResolvedValue(2);
    c.tx.operationalRequirement.findMany.mockResolvedValue([
      requirement(),
      requirement({ id: "requirement-b", sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceLineId: "line-b" }),
    ]);
    c.tx.travelPackage.findMany.mockResolvedValue([travelPackage()]);
    c.tx.operationalFulfillmentPassenger.findMany.mockResolvedValue([
      passenger({ operationalFulfillmentId: "confirmed-a", travelPackageParticipantId: "participant-a", fullName: "Ada Lovelace" }),
      passenger({ operationalFulfillmentId: "confirmed-a", travelPackageParticipantId: "participant-b", travelPackageParticipant: { id: "participant-b", clientId: "client-b", role: "TRAVELER", client: { fullName: "Ben Turing" } } }),
      passenger({ operationalFulfillmentId: "cancelled-b", travelPackageParticipantId: "participant-c", fullName: "Cleo Hopper" }),
    ]);
    c.tx.operationalPurchase.findMany.mockResolvedValue([purchase()]);
    c.tx.operationalEvidence.findMany.mockResolvedValue([evidence()]);

    await expect(c.service.list(tenantId, { page: 1, pageSize: 20 })).resolves.toMatchObject({
      total: 2,
      dateAuthority: "FULFILLMENT_TERMINAL_UPDATED_AT",
      items: [
        {
          fulfillmentId: "confirmed-a",
          terminalStatus: "CONFIRMED",
          sourceCategory: "BASE_TRIP",
          trip: { travelPackageId: "travel-a", name: "Europa 2026" },
          passengers: [
            { travelPackageParticipantId: "participant-a", fullName: "Ada Lovelace" },
            { travelPackageParticipantId: "participant-b", fullName: "Ben Turing" },
          ],
          passengerCount: 2,
          purchase: { purchaseId: "purchase-a", amount: "125.50", taxAmount: "16.32" },
          evidenceCount: 1,
          evidence: [{ evidenceId: "evidence-a", originalFilename: "voucher.pdf" }],
        },
        { fulfillmentId: "cancelled-b", sourceCategory: "ADDITIONAL_SERVICES", purchase: null },
      ],
    });

    const where = c.tx.operationalFulfillment.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tenantId,
      travelPackageId: { not: null },
      status: { in: ["CONFIRMED", "CANCELLED"] },
      operationalRequirement: { scopeType: "TRAVEL_PACKAGE", sourceType: { in: ["TRAVEL_PACKAGE_COST_COMPONENT", "ADDITIONAL_SERVICE_ORDER_LINE"] } },
    });
    expect(c.tx.operationalFulfillment.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 20, skip: 0,
    });
    expect(c.tx.operationalFulfillmentPassenger.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.operationalPurchase.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.operationalEvidence.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.travelPackage.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.operationalRequirement.findMany).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(c.tx.operationalEvidence.findMany.mock.calls[0][0].select)).not.toContain("objectKey");
  });

  it("combines trip and participant filters tenant-safely without using Contract identity", async () => {
    const c = context();
    await c.service.list(tenantId, {
      travelPackageId: "travel-a",
      travelPackageParticipantId: "participant-a",
      page: 2,
      pageSize: 25,
    });
    expect(c.tx.operationalFulfillment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        travelPackageId: "travel-a",
        passengers: { some: { tenantId, travelPackageParticipantId: "participant-a" } },
      }),
      skip: 25,
      take: 25,
    }));
  });

  it.each([
    ["BASE_TRIP", ["TRAVEL_PACKAGE_COST_COMPONENT"]],
    ["ADDITIONAL_SERVICES", ["ADDITIONAL_SERVICE_ORDER_LINE"]],
  ] as const)("filters %s source history", async (sourceCategory, sourceTypes) => {
    const c = context();
    await c.service.list(tenantId, { sourceCategory });
    expect(c.tx.operationalFulfillment.findMany.mock.calls[0][0].where.operationalRequirement.sourceType)
      .toEqual({ in: sourceTypes });
  });

  it.each(["CONFIRMED", "CANCELLED"] as const)("filters terminal status %s while excluding PURCHASED", async (terminalStatus) => {
    const c = context();
    await c.service.list(tenantId, { terminalStatus });
    expect(c.tx.operationalFulfillment.findMany.mock.calls[0][0].where.status).toEqual({ in: [terminalStatus] });
  });

  it.each([
    ["TODAY", "2026-10-09T06:00:00.000Z", "2026-10-10T06:00:00.000Z"],
    ["LAST_7_DAYS", "2026-10-03T06:00:00.000Z", "2026-10-10T06:00:00.000Z"],
    ["LAST_30_DAYS", "2026-09-10T06:00:00.000Z", "2026-10-10T06:00:00.000Z"],
  ] as const)("uses tenant fiscal timezone boundaries for %s", async (datePreset, start, end) => {
    const c = context();
    await c.service.list(tenantId, { datePreset }, new Date("2026-10-09T18:00:00.000Z"));
    const range = c.tx.operationalFulfillment.findMany.mock.calls[0][0].where.updatedAt;
    expect(range.gte.toISOString()).toBe(start);
    expect(range.lt.toISOString()).toBe(end);
  });

  it("uses inclusive tenant-calendar custom date boundaries and rejects invalid ranges", async () => {
    const c = context();
    await c.service.list(tenantId, { datePreset: "CUSTOM", dateFrom: "2026-10-01", dateTo: "2026-10-02" });
    const range = c.tx.operationalFulfillment.findMany.mock.calls[0][0].where.updatedAt;
    expect(range.gte.toISOString()).toBe("2026-10-01T06:00:00.000Z");
    expect(range.lt.toISOString()).toBe("2026-10-03T06:00:00.000Z");
    await expect(c.service.list(tenantId, { datePreset: "CUSTOM", dateFrom: "2026-10-03", dateTo: "2026-10-02" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects page sizes above 25", async () => {
    const c = context();
    await expect(c.service.list(tenantId, { pageSize: 26 })).rejects.toBeInstanceOf(BadRequestException);
    expect(c.tx.operationalFulfillment.findMany).not.toHaveBeenCalled();
  });

  it("returns read-only full historical detail, including all purchases and evidence metadata", async () => {
    const c = context();
    c.tx.operationalFulfillment.findFirst.mockResolvedValue(fulfillment());
    c.tx.operationalRequirement.findMany.mockResolvedValue([requirement()]);
    c.tx.travelPackage.findMany.mockResolvedValue([travelPackage()]);
    c.tx.operationalFulfillmentPassenger.findMany.mockResolvedValue([passenger()]);
    c.tx.operationalPurchase.findMany.mockResolvedValue([purchase(), purchase({ id: "purchase-old", purchasedAt: new Date("2026-09-01T12:00:00.000Z") })]);
    c.tx.operationalEvidence.findMany.mockResolvedValue([evidence()]);

    await expect(c.service.find(tenantId, "confirmed-a")).resolves.toMatchObject({
      fulfillmentId: "confirmed-a",
      detailPayload: { roomType: "double" },
      detailVersion: 1,
      purchases: [{ purchaseId: "purchase-a" }, { purchaseId: "purchase-old" }],
      evidence: [{ evidenceId: "evidence-a", mimeType: "application/pdf" }],
    });
    expect(c.tx.operationalFulfillment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "confirmed-a", tenantId, status: { in: ["CONFIRMED", "CANCELLED"] } }),
    }));

    c.tx.operationalFulfillment.findFirst.mockResolvedValueOnce(null);
    await expect(c.service.find("tenant-b", "confirmed-a")).rejects.toBeInstanceOf(NotFoundException);
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
    operationalFulfillment: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), findFirst: jest.fn() },
    operationalRequirement: { findMany: jest.fn().mockResolvedValue([]) },
    travelPackage: { findMany: jest.fn().mockResolvedValue([]) },
    operationalFulfillmentPassenger: { findMany: jest.fn().mockResolvedValue([]) },
    operationalPurchase: { findMany: jest.fn().mockResolvedValue([]) },
    operationalEvidence: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  return { tx, service: new OperationalTravelHistoryService(prisma as never) };
}

function fulfillment(overrides: Record<string, unknown> = {}) {
  return {
    id: "confirmed-a", travelPackageId: "travel-a", operationalRequirementId: "requirement-a",
    servicePurposeCode: "LODGING", servicePurposeName: "Hotel", providerName: "Hotel Uno", providerReference: "supplier-ref",
    reservationCode: "RES-001", confirmationReference: "CONF-001", voucherReference: "VOUCHER-001", ticketReference: null,
    serviceStartAt: new Date("2026-11-01T06:00:00.000Z"), serviceEndAt: new Date("2026-11-03T06:00:00.000Z"),
    detailPayload: { roomType: "double" }, detailVersion: 1, confirmationNotes: "Confirmed", status: "CONFIRMED",
    updatedAt: new Date("2026-10-09T12:00:00.000Z"), ...overrides,
  };
}

function requirement(overrides: Record<string, unknown> = {}) {
  return {
    id: "requirement-a", travelPackageId: "travel-a", sourceType: "TRAVEL_PACKAGE_COST_COMPONENT", sourceId: "project-a",
    sourceLineId: "component-a", sourceReference: "Base lodging", servicePurposeCode: "LODGING", servicePurposeName: "Hotel",
    description: "Hotel in Paris", ...overrides,
  };
}

function travelPackage() {
  return { id: "travel-a", packageCode: "EU-2026", name: "Europa 2026", departureDate: new Date("2026-11-01T00:00:00.000Z"), returnDate: new Date("2026-11-15T00:00:00.000Z") };
}

function passenger(overrides: Record<string, unknown> = {}) {
  return {
    operationalFulfillmentId: "confirmed-a", travelPackageParticipantId: "participant-a", createdAt: new Date("2026-01-01T00:00:00.000Z"), id: "ofp-a",
    travelPackageParticipant: { id: "participant-a", clientId: "client-a", role: "TRAVELER", client: { fullName: "Ada Lovelace" } }, ...overrides,
  };
}

function purchase(overrides: Record<string, unknown> = {}) {
  return {
    id: "purchase-a", operationalFulfillmentId: "confirmed-a", providerName: "Hotel Uno", supplierReference: "supplier-ref",
    amount: { toFixed: () => "125.50" }, currency: "USD", taxAmount: { toFixed: () => "16.32" },
    purchasedAt: new Date("2026-10-08T12:00:00.000Z"), supplierInvoiceNumber: "INV-001", notes: "Paid", ...overrides,
  };
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    id: "evidence-a", operationalFulfillmentId: "confirmed-a", operationalPurchaseId: "purchase-a", evidenceType: "VOUCHER",
    originalFilename: "voucher.pdf", mimeType: "application/pdf", byteSize: 1024, uploadedByUserId: "user-a", uploadedByName: "Operator A",
    createdAt: new Date("2026-10-08T13:00:00.000Z"), ...overrides,
  };
}
