import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CustomQuotationVersionService } from "./custom-quotation-version.service";

const actor = { userId: "agent-a", name: "Agent A" };

describe("CustomQuotationVersionService", () => {
  it("atomically issues version 1 with frozen commercial, fiscal, and descriptive-line snapshots", async () => {
    const c = context();
    prepareIssuableQuotation(c);

    const result = await c.service.issue("tenant-a", "quotation-a", actor);

    expect(c.pricing.approveCalculationInTransaction).toHaveBeenCalledWith(c.tx, "tenant-a", "pricing-a", actor);
    expect(c.tx.customQuotationVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: "tenant-a", customQuotationId: "quotation-a", versionNumber: 1,
        finalSellingPrice: "1450.12345", pricingCalculationVersionId: "pricing-a",
        cabysCode: "1234567890123", unitOfMeasureCode: "Unid", taxCode: "01", taxRateCode: "08",
        fiscalTaxPercentage: "13.0000",
      }),
    }));
    expect(c.tx.customQuotationVersionLine.createMany).toHaveBeenCalledWith({ data: [
      { tenantId: "tenant-a", customQuotationVersionId: "issued-a", displayOrder: 1, description: "Traslado privado", quantity: "1.2500", commercialNote: "Hotel al aeropuerto" },
      { tenantId: "tenant-a", customQuotationVersionId: "issued-a", displayOrder: 2, description: "Servicio adicional", quantity: "2.0000", commercialNote: null },
    ] });
    expect(c.tx.customQuotation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "quotation-a", tenantId: "tenant-a", status: "DRAFT" },
      data: expect.objectContaining({ status: "ISSUED" }),
    }));
    expect(result).toEqual(expect.objectContaining({
      customQuotationVersionId: "issued-a", quotationId: "quotation-a", versionNumber: 1,
      quotationNumber: "CQ-2026-000001", finalSellingPrice: "1450.12345", status: "ISSUED",
      lines: [
        { displayOrder: 1, description: "Traslado privado", quantity: "1.2500", commercialNote: "Hotel al aeropuerto" },
        { displayOrder: 2, description: "Servicio adicional", quantity: "2.0000", commercialNote: null },
      ],
    }));
    expect(c.tx.salesOrder).toBeUndefined();
    expect(c.tx.billingDocument).toBeUndefined();
  });

  it("does not let later draft or fiscal source changes alter the persisted snapshots", async () => {
    const c = context();
    prepareIssuableQuotation(c);
    await c.service.issue("tenant-a", "quotation-a", actor);

    const versionInput = c.tx.customQuotationVersion.create.mock.calls[0][0].data;
    const lineInput = c.tx.customQuotationVersionLine.createMany.mock.calls[0][0].data;
    expect(versionInput).toMatchObject({ fiscalDescription: "Transporte privado", cabysCode: "1234567890123" });
    expect(lineInput[0]).toMatchObject({ description: "Traslado privado", quantity: "1.2500" });
    expect(versionInput).not.toHaveProperty("tenantFiscalClassification");
    expect(lineInput[0]).not.toHaveProperty("customQuotationLineId");
  });

  it("rejects stale or missing pricing, no lines, inactive classifications, non-DRAFT and cross-tenant quotations", async () => {
    const stale = context();
    prepareIssuableQuotation(stale);
    stale.currentCosts.read.mockResolvedValue({ authoritativeTotalCost: "1001.00000", baseCurrency: "USD" });
    await expect(stale.service.issue("tenant-a", "quotation-a", actor)).rejects.toBeInstanceOf(ConflictException);
    expect(stale.pricing.approveCalculationInTransaction).not.toHaveBeenCalled();
    expect(stale.tx.customQuotationVersion.create).not.toHaveBeenCalled();

    const missingCalculation = context();
    prepareIssuableQuotation(missingCalculation);
    missingCalculation.tx.pricingCalculationVersion.findFirst.mockResolvedValue(null);
    await expect(missingCalculation.service.issue("tenant-a", "quotation-a", actor)).rejects.toBeInstanceOf(NotFoundException);

    const noLines = context();
    prepareIssuableQuotation(noLines);
    noLines.tx.customQuotationLine.findMany.mockResolvedValue([]);
    await expect(noLines.service.issue("tenant-a", "quotation-a", actor)).rejects.toBeInstanceOf(BadRequestException);

    const inactive = context();
    prepareIssuableQuotation(inactive);
    inactive.tx.tenantFiscalClassification.findFirst.mockResolvedValue(classification({ isActive: false }));
    await expect(inactive.service.issue("tenant-a", "quotation-a", actor)).rejects.toBeInstanceOf(BadRequestException);

    const nonDraft = context();
    prepareIssuableQuotation(nonDraft);
    nonDraft.tx.customQuotation.findFirst.mockResolvedValue(quotation({ status: "ISSUED" }));
    await expect(nonDraft.service.issue("tenant-a", "quotation-a", actor)).rejects.toBeInstanceOf(ConflictException);

    const crossTenant = context();
    crossTenant.tx.$queryRaw.mockResolvedValue([]);
    await expect(crossTenant.service.issue("tenant-a", "quotation-b", actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reuses an already approved, fresh pricing version without approving it again", async () => {
    const c = context();
    prepareIssuableQuotation(c, { pricing: pricingCalculation({ status: "APPROVED" }) });

    await c.service.issue("tenant-a", "quotation-a", actor);

    expect(c.pricing.approveCalculationInTransaction).not.toHaveBeenCalled();
    expect(c.tx.customQuotationVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pricingCalculationVersionId: "pricing-a", finalSellingPrice: "1450.12345" }),
    }));
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ id: "quotation-a" }]),
    customQuotation: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    customQuotationLine: { findMany: jest.fn() },
    tenantFiscalClassification: { findFirst: jest.fn() },
    pricingCalculationVersion: { findFirst: jest.fn() },
    pricingConfiguration: {},
    customQuotationVersion: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(issuedVersion()) },
    customQuotationVersionLine: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
  } as any;
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  const currentCosts = { read: jest.fn().mockResolvedValue({ costingProjectId: "project-a", baseCurrency: "USD", authoritativeTotalCost: "1000.00000" }) };
  const pricing = { approveCalculationInTransaction: jest.fn().mockResolvedValue(pricingCalculation({ status: "APPROVED" })) };
  return { tx, currentCosts, pricing, service: new CustomQuotationVersionService(prisma as never, currentCosts as never, pricing as never) };
}

function prepareIssuableQuotation(c: ReturnType<typeof context>, input: { pricing?: Record<string, unknown> } = {}) {
  c.tx.customQuotation.findFirst.mockResolvedValue(quotation());
  c.tx.customQuotationLine.findMany.mockResolvedValue(lines());
  c.tx.tenantFiscalClassification.findFirst.mockResolvedValue(classification());
  c.tx.pricingCalculationVersion.findFirst.mockResolvedValue(input.pricing ?? pricingCalculation());
}

function quotation(overrides: Record<string, unknown> = {}) {
  return {
    id: "quotation-a", quotationNumber: "CQ-2026-000001", currency: "USD", status: "DRAFT",
    commercialObservations: "Incluye traslados", quotationValidUntil: new Date("2026-12-31T00:00:00.000Z"),
    paymentConditionType: "CREDIT", paymentTermValue: 30, paymentTermUnit: "DAYS", fiscalClassificationId: "fiscal-a",
    costingProjectLink: { costingProject: { id: "project-a", baseCurrency: "USD" } }, ...overrides,
  };
}

function pricingCalculation(overrides: Record<string, unknown> = {}) {
  return { id: "pricing-a", costingProjectId: "project-a", currency: "USD", status: "DRAFT", authoritativeCostAmount: "1000.00000", finalSellingPrice: "1450.12345", ...overrides };
}

function classification(overrides: Record<string, unknown> = {}) {
  return { id: "fiscal-a", isActive: true, displayName: "Transporte privado", description: null, fiscalItemCategory: "SERVICE", cabysCode: "1234567890123", unitOfMeasureCode: "Unid", taxCode: "01", taxRateCode: "08", taxPercentage: "13.0000", ...overrides };
}

function lines() {
  return [
    { id: "line-a", displayOrder: 1, description: "Traslado privado", quantity: "1.2500", commercialNote: "Hotel al aeropuerto" },
    { id: "line-b", displayOrder: 2, description: "Servicio adicional", quantity: "2.0000", commercialNote: null },
  ];
}

function issuedVersion() {
  return {
    id: "issued-a", customQuotationId: "quotation-a", versionNumber: 1, currency: "USD", finalSellingPrice: "1450.12345",
    quotationValidUntil: new Date("2026-12-31T00:00:00.000Z"), status: "ISSUED", createdAt: new Date("2026-09-21T00:00:00.000Z"),
  };
}
