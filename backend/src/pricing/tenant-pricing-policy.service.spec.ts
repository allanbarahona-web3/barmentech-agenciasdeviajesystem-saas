import { BadRequestException, NotFoundException } from "@nestjs/common";
import { TenantPricingPolicyService } from "./tenant-pricing-policy.service";

const tenantId = "tenant-a";
const actor = { userId: "admin-a", name: "Admin A" };

describe("TenantPricingPolicyService", () => {
  it("creates a tenant policy with exact pricing decimal strings and audit attribution", async () => {
    const c = context();
    c.tx.tenantPricingPolicy.create.mockResolvedValue(record());

    const result = await c.service.create(tenantId, create(), actor);

    expect(c.tx.tenantPricingPolicy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        name: "Política estándar",
        calculationPolicyVersion: "PRICING_V1",
        operationalCostsAmountDefault: "12.34567",
        riskMarginPercent: "2.500000",
        targetProfitMarginPercent: "20.000000",
        salesCommissionPercent: "3.000000",
        bankCommissionPercent: "1.500000",
        applicableTaxPercent: "13.000000",
        createdByUserId: actor.userId,
        createdByName: actor.name,
      }),
    });
    expect(result).toMatchObject({
      operationalCostsAmountDefault: "12.34567",
      riskMarginPercent: "2.500000",
      calculationPolicyVersion: "PRICING_V1",
    });
  });

  it("lists and reads policies with tenant predicates and bounded ordering", async () => {
    const c = context();
    c.tx.tenantPricingPolicy.findMany.mockResolvedValue([record()]);
    c.tx.tenantPricingPolicy.count.mockResolvedValue(1);

    const list = await c.service.list(tenantId, true, 1, 20);

    expect(list).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(c.tx.tenantPricingPolicy.findMany).toHaveBeenCalledWith({
      where: { tenantId, active: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: 0,
      take: 20,
    });
    c.tx.tenantPricingPolicy.findFirst.mockResolvedValue(null);
    await expect(c.service.find("tenant-b", "policy-a")).rejects.toBeInstanceOf(NotFoundException);
    expect(c.tx.tenantPricingPolicy.findFirst).toHaveBeenCalledWith({
      where: { id: "policy-a", tenantId: "tenant-b" },
    });
  });

  it("updates only tenant-owned policy configuration with exact decimal strings", async () => {
    const c = context();
    const current = record({ updatedAt: new Date("2026-09-23T00:00:00.000Z") });
    c.tx.tenantPricingPolicy.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(record({ riskMarginPercent: decimal("4.250000") }));
    c.tx.tenantPricingPolicy.updateMany.mockResolvedValue({ count: 1 });

    const result = await c.service.update(
      tenantId,
      "policy-a",
      { riskMarginPercent: "4.250000", description: "Revisada" },
      actor,
    );

    expect(c.tx.tenantPricingPolicy.updateMany).toHaveBeenCalledWith({
      where: { id: "policy-a", tenantId },
      data: expect.objectContaining({
        riskMarginPercent: "4.250000",
        description: "Revisada",
        updatedByUserId: actor.userId,
        updatedByName: actor.name,
      }),
    });
    expect(result.riskMarginPercent).toBe("4.250000");
  });

  it("deactivates a default policy by unsetting its default in the same update and can reactivate it", async () => {
    const c = context();
    c.tx.tenantPricingPolicy.findFirst
      .mockResolvedValueOnce(record({ isDefaultForCustomQuotations: true }))
      .mockResolvedValueOnce(record({ active: false, isDefaultForCustomQuotations: false }))
      .mockResolvedValueOnce(record({ active: false, isDefaultForCustomQuotations: false }))
      .mockResolvedValueOnce(record({ active: true, isDefaultForCustomQuotations: false }));
    c.tx.tenantPricingPolicy.updateMany.mockResolvedValue({ count: 1 });

    await expect(c.service.setStatus(tenantId, "policy-a", false, actor)).resolves.toMatchObject({
      active: false,
      isDefaultForCustomQuotations: false,
    });
    await expect(c.service.setStatus(tenantId, "policy-a", true, actor)).resolves.toMatchObject({
      active: true,
    });
    expect(c.tx.tenantPricingPolicy.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "policy-a", tenantId },
        data: expect.objectContaining({ active: false, isDefaultForCustomQuotations: false }),
      }),
    );
    expect(c.tx.tenantPricingPolicy.delete).not.toHaveBeenCalled();
  });

  it("switches the active default atomically by clearing policy A before marking policy B", async () => {
    const c = context();
    c.tx.tenantPricingPolicy.findFirst
      .mockResolvedValueOnce(record({ id: "policy-b", isDefaultForCustomQuotations: false }))
      .mockResolvedValueOnce(record({ id: "policy-b", isDefaultForCustomQuotations: true }));
    c.tx.tenantPricingPolicy.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(
      c.service.setDefaultForCustomQuotations(tenantId, "policy-b", true, actor),
    ).resolves.toMatchObject({ id: "policy-b", isDefaultForCustomQuotations: true });

    expect(c.tx.tenantPricingPolicy.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          tenantId,
          active: true,
          isDefaultForCustomQuotations: true,
          id: { not: "policy-b" },
        },
        data: expect.objectContaining({ isDefaultForCustomQuotations: false }),
      }),
    );
    expect(c.tx.tenantPricingPolicy.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: "policy-b", tenantId },
        data: expect.objectContaining({ isDefaultForCustomQuotations: true }),
      }),
    );
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("resolves only the active tenant default and never reads PricingConfiguration", async () => {
    const c = context();
    c.tx.tenantPricingPolicy.findFirst.mockResolvedValueOnce(
      record({ isDefaultForCustomQuotations: true }),
    );

    await expect(c.service.resolveDefaultCustomQuotationPricingPolicy(tenantId)).resolves.toMatchObject({
      id: "policy-a",
      isDefaultForCustomQuotations: true,
    });
    expect(c.tx.tenantPricingPolicy.findFirst).toHaveBeenCalledWith({
      where: { tenantId, active: true, isDefaultForCustomQuotations: true },
    });
    expect(Object.keys(c.tx)).not.toContain("pricingConfiguration");

    c.tx.tenantPricingPolicy.findFirst.mockResolvedValueOnce(null);
    await expect(c.service.resolveDefaultCustomQuotationPricingPolicy(tenantId)).resolves.toBeNull();
  });

  it("rejects inactive defaults and percentages outside the supported PRICING_V1 range", async () => {
    const c = context();

    await expect(c.service.create(tenantId, create({ active: false, isDefaultForCustomQuotations: true }), actor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(c.service.create(tenantId, create({ riskMarginPercent: "100.000001" }), actor)).rejects.toMatchObject({
      response: expect.objectContaining({ message: "PRICING_PERCENTAGE_OUT_OF_RANGE" }),
    });
    expect(c.tx.tenantPricingPolicy.create).not.toHaveBeenCalled();
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    tenantPricingPolicy: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
  };
  return { tx, service: new TenantPricingPolicyService(prisma as never) };
}

function create(overrides: Record<string, unknown> = {}) {
  return {
    name: "Política estándar",
    description: null,
    active: true,
    isDefaultForCustomQuotations: false,
    operationalCostsAmountDefault: "12.34567",
    riskMarginPercent: "2.500000",
    targetProfitMarginPercent: "20.000000",
    salesCommissionPercent: "3.000000",
    bankCommissionPercent: "1.500000",
    applicableTaxPercent: "13.000000",
    ...overrides,
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "policy-a",
    tenantId,
    name: "Política estándar",
    description: null,
    active: true,
    isDefaultForCustomQuotations: false,
    calculationPolicyVersion: "PRICING_V1",
    operationalCostsAmountDefault: decimal("12.34567"),
    riskMarginPercent: decimal("2.500000"),
    targetProfitMarginPercent: decimal("20.000000"),
    salesCommissionPercent: decimal("3.000000"),
    bankCommissionPercent: decimal("1.500000"),
    applicableTaxPercent: decimal("13.000000"),
    createdByUserId: actor.userId,
    createdByName: actor.name,
    updatedByUserId: null,
    updatedByName: null,
    createdAt: new Date("2026-09-23T00:00:00.000Z"),
    updatedAt: new Date("2026-09-23T00:00:00.000Z"),
    ...overrides,
  };
}

function decimal(value: string) {
  return { toFixed: (digits?: number) => {
    const [integer, fraction = ""] = value.split(".");
    return digits === undefined ? value : `${integer}.${fraction.padEnd(digits, "0")}`;
  } };
}
