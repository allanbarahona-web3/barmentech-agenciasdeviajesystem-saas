import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CustomQuotationApprovalService } from "./custom-quotation-approval.service";

const actor = { userId: "agent-a", name: "Agent A" };

describe("CustomQuotationApprovalService", () => {
  it("accepts an ISSUED immutable version atomically and preserves commercial snapshots", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(version());

    const result = await c.service.accept("tenant-a", "quotation-a", "version-a", actor);

    const versionWrite = c.tx.customQuotationVersion.updateMany.mock.calls[0][0];
    expect(versionWrite.where).toEqual({ id: "version-a", tenantId: "tenant-a", customQuotationId: "quotation-a", status: "ISSUED" });
    expect(versionWrite.data).toMatchObject({ status: "ACCEPTED", acceptedByUserId: "agent-a", acceptedByName: "Agent A", acceptedAt: expect.any(Date) });
    for (const immutableField of ["finalSellingPrice", "currency", "fiscalDescription", "cabysCode", "paymentConditionType", "pricingCalculationVersionId"]) {
      expect(versionWrite.data).not.toHaveProperty(immutableField);
    }
    expect(c.tx.customQuotation.updateMany).toHaveBeenCalledWith({
      where: { id: "quotation-a", tenantId: "tenant-a", status: "ISSUED" },
      data: { status: "ACCEPTED", updatedByUserId: "agent-a", updatedByName: "Agent A" },
    });
    expect(result).toMatchObject({ customQuotationVersionId: "version-a", quotationId: "quotation-a", status: "ACCEPTED", acceptedBy: actor });
    expect(c.tx.customQuotationVersionLine).toBeUndefined();
    expect(c.tx.salesOrder).toBeUndefined();
    expect(c.tx.billingDocument).toBeUndefined();
  });

  it("rejects an ISSUED version and transitions only the version and parent lifecycle", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(version());

    const result = await c.service.reject("tenant-a", "quotation-a", "version-a", actor);

    expect(c.tx.tenantBillingConfiguration.findUnique).not.toHaveBeenCalled();
    expect(c.tx.customQuotationVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "REJECTED", rejectedAt: expect.any(Date) },
    }));
    expect(c.tx.customQuotation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "REJECTED", updatedByUserId: "agent-a", updatedByName: "Agent A" },
    }));
    expect(result).toMatchObject({ status: "REJECTED", rejectedAt: expect.any(Date) });
  });

  it("rejects expired acceptance before lifecycle writes using tenant business dates", async () => {
    const c = context();
    c.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ quotationValidUntil: new Date("2020-01-01T12:00:00.000Z") }));

    await expect(c.service.accept("tenant-a", "quotation-a", "version-a", actor)).rejects.toBeInstanceOf(BadRequestException);

    expect(c.tx.tenantBillingConfiguration.findUnique).toHaveBeenCalledWith({ where: { tenantId: "tenant-a" }, select: { fiscalTimezone: true } });
    expect(c.tx.customQuotationVersion.updateMany).not.toHaveBeenCalled();
    expect(c.tx.customQuotation.updateMany).not.toHaveBeenCalled();
  });

  it("is idempotent for the same terminal request and rejects opposite or invalid transitions", async () => {
    const accepted = context();
    accepted.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ status: "ACCEPTED", acceptedAt: new Date("2026-09-21T12:00:00.000Z"), acceptedByUserId: "agent-a", acceptedByName: "Agent A" }));
    await expect(accepted.service.accept("tenant-a", "quotation-a", "version-a", actor)).resolves.toMatchObject({ status: "ACCEPTED" });
    expect(accepted.tx.customQuotationVersion.updateMany).not.toHaveBeenCalled();
    expect(accepted.tx.customQuotation.updateMany).not.toHaveBeenCalled();
    await expect(accepted.service.reject("tenant-a", "quotation-a", "version-a", actor)).rejects.toBeInstanceOf(ConflictException);

    const rejected = context();
    rejected.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ status: "REJECTED", rejectedAt: new Date("2026-09-21T12:00:00.000Z") }));
    await expect(rejected.service.reject("tenant-a", "quotation-a", "version-a", actor)).resolves.toMatchObject({ status: "REJECTED" });
    expect(rejected.tx.customQuotationVersion.updateMany).not.toHaveBeenCalled();
    await expect(rejected.service.accept("tenant-a", "quotation-a", "version-a", actor)).rejects.toBeInstanceOf(ConflictException);

    const cancelled = context();
    cancelled.tx.customQuotationVersion.findFirst.mockResolvedValue(version({ status: "CANCELLED" }));
    await expect(cancelled.service.accept("tenant-a", "quotation-a", "version-a", actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects cross-tenant versions before any lifecycle side effect", async () => {
    const c = context();
    c.tx.$queryRaw.mockResolvedValue([]);

    await expect(c.service.accept("tenant-a", "quotation-a", "version-b", actor)).rejects.toBeInstanceOf(NotFoundException);

    expect(c.tx.customQuotationVersion.findFirst).not.toHaveBeenCalled();
    expect(c.tx.customQuotationVersion.updateMany).not.toHaveBeenCalled();
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ id: "locked" }]),
    customQuotation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    customQuotationVersion: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Costa_Rica" }) },
  } as any;
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  return { tx, service: new CustomQuotationApprovalService(prisma as never) };
}

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: "version-a", customQuotationId: "quotation-a", costingProjectId: "project-a", pricingCalculationVersionId: "pricing-a",
    status: "ISSUED", currency: "USD", finalSellingPrice: "1450.12345", quotationValidUntil: new Date("2099-12-31T12:00:00.000Z"),
    fiscalDescription: "Transporte privado", fiscalItemCategory: "SERVICE", cabysCode: "1234567890123", unitOfMeasureCode: "Unid", taxCode: "01", taxRateCode: "08", fiscalTaxPercentage: "13.0000",
    acceptedAt: null, acceptedByUserId: null, acceptedByName: null, rejectedAt: null, lines: [{ id: "snapshot-line-a" }],
    pricingCalculationVersion: { id: "pricing-a", status: "APPROVED", currency: "USD" },
    ...overrides,
  };
}
