import { CustomQuotationOperationalWorkSourceAdapter, CUSTOM_QUOTATION_LINE_SOURCE } from "./custom-quotation-operational-work-source.adapter";
import { OperationalWorkMaterializationError } from "../../operations/intake/operational-work-source-reader.port";

describe("CustomQuotationOperationalWorkSourceAdapter", () => {
  const reference = {
    tenantId: "tenant-a",
    scopeType: "STANDALONE_CUSTOMER" as const,
    customerId: "customer-a",
    sourceType: CUSTOM_QUOTATION_LINE_SOURCE,
    sourceId: "version-a",
    sourceLineId: "version-line-a",
  };

  it("resolves AIRFARE from immutable Pricing lineage with exact source identity and commercial value", async () => {
    const c = context();
    c.tx.customQuotationVersionLine.findFirst.mockResolvedValue(line());

    await expect(c.adapter.readSourceItem(reference)).resolves.toEqual({
      ...reference,
      sourceVersionId: "version-a",
      sourceReference: null,
      sourceAcceptedAt: new Date("2026-10-01T12:00:00.000Z"),
      servicePurposeCode: "AIRFARE",
      servicePurposeName: "Airfare",
      description: "Traslado privado",
      sourceSnapshot: {
        customQuotationVersionId: "version-a",
        customQuotationVersionLineId: "version-line-a",
        description: "Traslado privado",
        soldAmount: "700.00000",
        currency: "USD",
        pricingCalculationComponentLineId: "pricing-line-a",
        pricingCostCategoryCode: "AIRFARE",
        pricingCostCategoryDisplayName: "Airfare",
      },
      soldValueScope: "EXACT_SERVICE_LINE",
      soldValue: { scope: "EXACT_SERVICE_LINE", amount: "700.00000", currency: "USD" },
    });
    expect(c.tx.customQuotationVersionLine.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "version-line-a", tenantId: "tenant-a", customQuotationVersionId: "version-a" },
      select: expect.objectContaining({ pricingCalculationComponentLine: expect.anything() }),
    }));
    expect((c.tx as Record<string, unknown>).customQuotationLine).toBeUndefined();
  });

  it("keeps tenant and version-line ownership in the authoritative lookup", async () => {
    const c = context();
    c.tx.customQuotationVersionLine.findFirst.mockResolvedValue(null);

    await expect(c.adapter.readSourceItem({ ...reference, tenantId: "tenant-b" }))
      .rejects.toMatchObject({ code: "SOURCE_NOT_FOUND", retryable: false });
    expect(c.tx.customQuotationVersionLine.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "version-line-a", tenantId: "tenant-b", customQuotationVersionId: "version-a" },
    }));
  });

  it.each([
    ["version is not accepted", line({ customQuotationVersion: version({ status: "ISSUED" }) })],
    ["parent is not accepted", line({ customQuotationVersion: version({ customQuotation: { status: "REJECTED", customerId: "customer-a" } }) })],
    ["version has no accepted timestamp", line({ customQuotationVersion: version({ acceptedAt: null }) })],
    ["accepted parent has no resolved customer", line({ customQuotationVersion: version({ customQuotation: { status: "ACCEPTED", customerId: null } }) })],
    ["line lacks immutable sold amount", line({ soldAmount: null })],
  ])("rejects an ineligible source when %s", async (_label, sourceLine) => {
    const c = context();
    c.tx.customQuotationVersionLine.findFirst.mockResolvedValue(sourceLine);

    await expect(c.adapter.readSourceItem(reference)).rejects.toBeInstanceOf(OperationalWorkMaterializationError);
    await expect(c.adapter.readSourceItem(reference)).rejects.toMatchObject({ code: "SOURCE_NOT_ELIGIBLE", retryable: false });
  });

  it("rejects missing lines and unsupported source types", async () => {
    const missing = context();
    missing.tx.customQuotationVersionLine.findFirst.mockResolvedValue(null);
    await expect(missing.adapter.readSourceItem(reference)).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND", retryable: false });

    const unsupported = context();
    await expect(unsupported.adapter.readSourceItem({ ...reference, sourceType: "OTHER" })).rejects.toMatchObject({
      code: "SOURCE_NOT_FOUND", retryable: false,
    });
    expect(unsupported.tx.customQuotationVersionLine.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ["LODGING", "LODGING"],
    ["TOUR", "TOUR_ACTIVITY"],
    ["TRANSPORTATION", "TRANSPORTATION"],
    ["OTHER", "GENERIC"],
  ])("maps immutable Pricing category %s to %s", async (category, expectedPurpose) => {
    const c = context();
    c.tx.customQuotationVersionLine.findFirst.mockResolvedValue(line({
      pricingCalculationComponentLine: { id: "pricing-line-a", costCategoryCode: category, costCategoryDisplayName: category },
    }));
    await expect(c.adapter.readSourceItem(reference)).resolves.toMatchObject({ servicePurposeCode: expectedPurpose });
  });

  it("falls back to GENERIC when immutable Pricing lineage is missing and never infers description", async () => {
    const c = context();
    c.tx.customQuotationVersionLine.findFirst.mockResolvedValue(line({
      description: "Vuelo AIRFARE a Madrid",
      pricingCalculationComponentLineId: null,
      pricingCalculationComponentLine: null,
    }));
    await expect(c.adapter.readSourceItem(reference)).resolves.toMatchObject({ servicePurposeCode: "GENERIC" });
  });
});

function context() {
  const tx = { $executeRaw: jest.fn(), customQuotationVersionLine: { findFirst: jest.fn() } };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  return { tx, adapter: new CustomQuotationOperationalWorkSourceAdapter(prisma as never) };
}

function line(overrides: Record<string, unknown> = {}) {
  return {
    id: "version-line-a",
    soldAmount: "700.00000",
    description: "Traslado privado",
    pricingCalculationComponentLineId: "pricing-line-a",
    pricingCalculationComponentLine: { id: "pricing-line-a", costCategoryCode: "AIRFARE", costCategoryDisplayName: "Airfare" },
    customQuotationVersion: version(),
    ...overrides,
  };
}

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: "version-a",
    status: "ACCEPTED",
    currency: "USD",
    acceptedAt: new Date("2026-10-01T12:00:00.000Z"),
    customQuotation: { status: "ACCEPTED", customerId: "customer-a" },
    ...overrides,
  };
}
