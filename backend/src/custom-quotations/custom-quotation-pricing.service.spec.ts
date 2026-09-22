import { ConflictException, NotFoundException } from "@nestjs/common";
import { CustomQuotationPricingService } from "./custom-quotation-pricing.service";

const actor = { userId: "agent-a", name: "Agent A" };

describe("CustomQuotationPricingService", () => {
  it("snapshots the active tenant default and returns only commercial calculation output", async () => {
    const c = context();
    c.tx.customQuotation.findFirst.mockResolvedValue(quotation());
    c.policies.resolveDefaultCustomQuotationPricingPolicy.mockResolvedValue(policy());
    c.pricing.resolveConfigurationFromSnapshot.mockResolvedValue({ configuration: { id: "configuration-a" } });
    c.pricing.calculate.mockResolvedValue(calculation());

    const result = await c.service.calculate("tenant-a", "quotation-a", actor);

    expect(c.policies.resolveDefaultCustomQuotationPricingPolicy).toHaveBeenCalledWith("tenant-a");
    expect(c.pricing.resolveConfigurationFromSnapshot).toHaveBeenCalledWith("tenant-a", "project-a", {
      operationalCostsAmount: "12.34567", riskMarginPercent: "1.250000", targetProfitMarginPercent: "20.000000",
      salesCommissionPercent: "3.500000", bankCommissionPercent: "2.000000", applicableTaxPercent: "13.000000",
    }, actor);
    expect(c.pricing.calculate).toHaveBeenCalledWith("tenant-a", "project-a", actor);
    expect(result).toEqual({ pricingCalculationVersionId: "version-a", currency: "USD", finalSellingPrice: "1450.00000", status: "DRAFT", stale: false });
    expect(result).not.toHaveProperty("authoritativeCostAmount");
    expect(result).not.toHaveProperty("riskMarginPercent");
    expect(result).not.toHaveProperty("taxAmount");
  });

  it("recalculates with the existing configuration snapshot after a cost change", async () => {
    const c = context();
    c.tx.customQuotation.findFirst.mockResolvedValue(quotation());
    c.policies.resolveDefaultCustomQuotationPricingPolicy.mockResolvedValue(policy({ riskMarginPercent: "9.000000" }));
    c.pricing.resolveConfigurationFromSnapshot.mockResolvedValue({ configuration: { id: "configuration-a" } });
    c.pricing.calculate
      .mockResolvedValueOnce(calculation({ id: "version-a", finalSellingPrice: "1450.00000", stale: false }))
      .mockResolvedValueOnce(calculation({ id: "version-b", finalSellingPrice: "1550.00000", stale: false }));
    await c.service.calculate("tenant-a", "quotation-a", actor);
    await c.service.calculate("tenant-a", "quotation-a", actor);
    expect(c.pricing.resolveConfigurationFromSnapshot).toHaveBeenCalledTimes(2);
    expect(c.pricing.calculate).toHaveBeenCalledTimes(2);
    expect(c.pricing.calculate.mock.results).toHaveLength(2);
  });

  it("rejects missing policies, missing links, non-DRAFTs, currency mismatches, and cross-tenant quotations", async () => {
    const policyMissing = context();
    policyMissing.tx.customQuotation.findFirst.mockResolvedValue(quotation());
    policyMissing.policies.resolveDefaultCustomQuotationPricingPolicy.mockResolvedValue(null);
    await expect(policyMissing.service.calculate("tenant-a", "quotation-a", actor)).rejects.toBeInstanceOf(NotFoundException);

    const noLink = context();
    noLink.tx.customQuotation.findFirst.mockResolvedValue(quotation({ costingProjectLink: null }));
    await expect(noLink.service.calculate("tenant-a", "quotation-a", actor)).rejects.toBeInstanceOf(NotFoundException);

    const nonDraft = context();
    nonDraft.tx.customQuotation.findFirst.mockResolvedValue(quotation({ status: "ISSUED" }));
    await expect(nonDraft.service.calculate("tenant-a", "quotation-a", actor)).rejects.toBeInstanceOf(ConflictException);

    const mismatch = context();
    mismatch.tx.customQuotation.findFirst.mockResolvedValue(quotation({ costingProjectLink: { costingProject: { id: "project-a", baseCurrency: "CRC" } } }));
    await expect(mismatch.service.calculate("tenant-a", "quotation-a", actor)).rejects.toBeInstanceOf(ConflictException);

    const crossTenant = context();
    crossTenant.tx.customQuotation.findFirst.mockResolvedValue(null);
    await expect(crossTenant.service.calculate("tenant-a", "quotation-b", actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("does not invoke travel publication, Sales Order, Billing, or local pricing inputs", async () => {
    const c = context();
    c.tx.customQuotation.findFirst.mockResolvedValue(quotation());
    c.policies.resolveDefaultCustomQuotationPricingPolicy.mockResolvedValue(policy());
    c.pricing.resolveConfigurationFromSnapshot.mockResolvedValue({ configuration: { id: "configuration-a" } });
    c.pricing.calculate.mockResolvedValue(calculation());
    await c.service.calculate("tenant-a", "quotation-a", actor);
    expect((c.pricing as Record<string, unknown>).createAutomaticDraftIfHigher).toBeUndefined();
    expect((c.pricing as Record<string, unknown>).approveCalculation).toBeUndefined();
    expect(c.tx.salesOrder).toBeUndefined();
    expect(c.tx.billingDocument).toBeUndefined();
  });
});

function context() {
  const tx = { $executeRaw: jest.fn(), customQuotation: { findFirst: jest.fn() } } as any;
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  const policies = { resolveDefaultCustomQuotationPricingPolicy: jest.fn() };
  const pricing = { resolveConfigurationFromSnapshot: jest.fn(), calculate: jest.fn() };
  return { tx, policies, pricing, service: new CustomQuotationPricingService(prisma as never, policies as never, pricing as never) };
}

function quotation(overrides: Record<string, unknown> = {}) {
  return { id: "quotation-a", currency: "USD", status: "DRAFT", costingProjectLink: { costingProject: { id: "project-a", baseCurrency: "USD" } }, ...overrides };
}

function policy(overrides: Record<string, unknown> = {}) {
  return { id: "policy-a", operationalCostsAmountDefault: "12.34567", riskMarginPercent: "1.250000", targetProfitMarginPercent: "20.000000", salesCommissionPercent: "3.500000", bankCommissionPercent: "2.000000", applicableTaxPercent: "13.000000", ...overrides };
}

function calculation(overrides: Record<string, unknown> = {}) {
  return { id: "version-a", currency: "USD", finalSellingPrice: "1450.00000", status: "DRAFT", stale: false, ...overrides };
}
