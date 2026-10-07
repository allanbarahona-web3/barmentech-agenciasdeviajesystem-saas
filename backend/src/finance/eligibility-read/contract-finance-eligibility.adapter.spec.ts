import { MODULE_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { CommercialObligationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { FinanceModule } from "../finance.module";
import { ContractFinanceEligibilityAdapter } from "./contract-finance-eligibility.adapter";
import { AdditionalServiceFinanceEligibilityAdapter } from "./additional-service-finance-eligibility.adapter";
import { CustomQuotationFinanceEligibilityAdapter } from "./custom-quotation-finance-eligibility.adapter";
import { FinanceEligibilityReaderAdapter } from "./finance-eligibility-reader.adapter";
import { FINANCE_ELIGIBILITY_READER } from "./finance-eligibility-reader.port";

const settledAt = new Date("2026-09-29T12:00:00.000Z");
const lastFinancialChangeAt = new Date("2026-09-29T13:00:00.000Z");
const cancelledAt = new Date("2026-09-29T14:00:00.000Z");

describe("ContractFinanceEligibilityAdapter", () => {
  it("returns ELIGIBLE / SETTLED for an active settled Contract", async () => {
    const c = context();
    c.tx.contract.findMany.mockResolvedValue([contract()]);
    c.tx.commercialObligation.findMany.mockResolvedValue([obligation()]);

    await expect(c.adapter.readMany(request())).resolves.toEqual([{
      source: source(),
      eligibility: "ELIGIBLE",
      reason: "SETTLED",
      financial: {
        originalAmount: "100",
        outstandingAmount: "0",
        currency: "USD",
        financialStatus: "SETTLED",
        settledAt,
        lastFinancialChangeAt,
      },
    }]);
  });

  it.each([
    ["outstanding balance", obligation({ outstandingAmount: decimal("0.00001") }), "OUTSTANDING_BALANCE"],
    ["PARTIALLY_SETTLED", obligation({ status: CommercialObligationStatus.PARTIALLY_SETTLED, outstandingAmount: decimal("50") }), "OUTSTANDING_BALANCE"],
    ["OPEN", obligation({ status: CommercialObligationStatus.OPEN, outstandingAmount: decimal("100") }), "OUTSTANDING_BALANCE"],
    ["SETTLED without settledAt", obligation({ settledAt: null }), "OUTSTANDING_BALANCE"],
  ])("fails closed for %s", async (_case, commercialObligation, reason) => {
    const c = context();
    c.tx.contract.findMany.mockResolvedValue([contract()]);
    c.tx.commercialObligation.findMany.mockResolvedValue([commercialObligation]);

    await expect(c.adapter.readMany(request())).resolves.toEqual([
      expect.objectContaining({ eligibility: "BLOCKED", reason }),
    ]);
  });

  it.each([
    ["cancelledAt", contract({ cancelledAt: cancelledAt }), "CONTRACT_CANCELLED"],
    ["CANCELLED status", contract({ status: "CANCELLED" }), "CONTRACT_CANCELLED"],
    ["a draft Contract", contract({ status: "DRAFT" }), "CONTRACT_NOT_ACTIVE"],
    ["a reservation review Contract", contract({ status: "RESERVE_IN_REVIEW" }), "CONTRACT_NOT_ACTIVE"],
  ])("blocks %s with the neutral Contract status reason", async (_case, commercialContract, reason) => {
    const c = context();
    c.tx.contract.findMany.mockResolvedValue([commercialContract]);
    c.tx.commercialObligation.findMany.mockResolvedValue([obligation()]);

    await expect(c.adapter.readMany(request())).resolves.toEqual([
      { source: source(), eligibility: "BLOCKED", reason },
    ]);
  });

  it("returns the same missing result for absent and cross-tenant Contracts", async () => {
    const c = context();
    c.tx.contract.findMany.mockResolvedValue([]);
    c.tx.commercialObligation.findMany.mockResolvedValue([]);

    await expect(c.adapter.readMany(request())).resolves.toEqual([
      { source: source(), eligibility: "BLOCKED", reason: "FINANCIAL_DATA_MISSING" },
    ]);
    expect(c.tx.contract.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", id: { in: ["contract-1"] } },
      select: { id: true, status: true, cancelledAt: true },
    });
  });

  it("returns FINANCIAL_DATA_MISSING when the Contract has no obligation", async () => {
    const c = context();
    c.tx.contract.findMany.mockResolvedValue([contract()]);
    c.tx.commercialObligation.findMany.mockResolvedValue([]);

    await expect(c.adapter.readMany(request())).resolves.toEqual([
      { source: source(), eligibility: "BLOCKED", reason: "FINANCIAL_DATA_MISSING" },
    ]);
  });

  it("uses one bounded Contract query and one bounded obligation query for independent sources", async () => {
    const c = context();
    c.tx.contract.findMany.mockResolvedValue([contract(), contract({ id: "contract-2" })]);
    c.tx.commercialObligation.findMany.mockResolvedValue([
      obligation(), obligation({ sourceId: "contract-2" }),
    ]);

    const result = await c.adapter.readMany({
      tenantId: "tenant-1",
      sources: [source(), source({ sourceId: "contract-2" })],
    });

    expect(result.map((item) => item.source.sourceId)).toEqual(["contract-1", "contract-2"]);
    expect(c.tx.contract.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.commercialObligation.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.commercialObligation.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        sourceType: "CONTRACT",
        sourceId: { in: ["contract-1", "contract-2"] },
      },
      select: {
        sourceId: true,
        currencyCode: true,
        originalAmount: true,
        outstandingAmount: true,
        status: true,
        settledAt: true,
        updatedAt: true,
      },
    });
  });

  it("deduplicates identical source refs while retaining distinct Contract sources", async () => {
    const c = context();
    c.tx.contract.findMany.mockResolvedValue([contract(), contract({ id: "contract-2" })]);
    c.tx.commercialObligation.findMany.mockResolvedValue([
      obligation(), obligation({ sourceId: "contract-2" }),
    ]);

    const result = await c.adapter.readMany({
      tenantId: "tenant-1",
      sources: [source(), source(), source({ sourceId: "contract-2" })],
    });

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.source.sourceId)).toEqual(["contract-1", "contract-2"]);
  });

  it("does no database work for an empty source batch", async () => {
    const c = context();
    await expect(c.adapter.readMany({ tenantId: "tenant-1", sources: [] })).resolves.toEqual([]);
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("uses Decimal exact zero comparison and the tenant transaction client only", async () => {
    const c = context();
    c.tx.contract.findMany.mockResolvedValue([contract()]);
    c.tx.commercialObligation.findMany.mockResolvedValue([
      obligation({ outstandingAmount: decimal("0.00000") }),
    ]);

    await expect(c.adapter.readMany(request())).resolves.toEqual([
      expect.objectContaining({ eligibility: "ELIGIBLE" }),
    ]);
    expect(c.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect((c.prisma as any).contract).toBeUndefined();
    expect((c.prisma as any).commercialObligation).toBeUndefined();
  });

  it("binds and resolves the neutral port through FinanceModule", async () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, FinanceModule);
    expect(providers).toEqual(expect.arrayContaining([
      ContractFinanceEligibilityAdapter,
      AdditionalServiceFinanceEligibilityAdapter,
      CustomQuotationFinanceEligibilityAdapter,
      FinanceEligibilityReaderAdapter,
      { provide: FINANCE_ELIGIBILITY_READER, useExisting: FinanceEligibilityReaderAdapter },
    ]));

    const c = context();
    const module = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: c.prisma },
        ContractFinanceEligibilityAdapter,
        AdditionalServiceFinanceEligibilityAdapter,
        CustomQuotationFinanceEligibilityAdapter,
        FinanceEligibilityReaderAdapter,
        { provide: FINANCE_ELIGIBILITY_READER, useExisting: FinanceEligibilityReaderAdapter },
      ],
    }).compile();
    expect(module.get(FINANCE_ELIGIBILITY_READER)).toBeInstanceOf(FinanceEligibilityReaderAdapter);
  });
});

function request() {
  return { tenantId: "tenant-1", sources: [source()] };
}

function source(overrides: Record<string, unknown> = {}) {
  return { sourceType: "CONTRACT" as const, sourceId: "contract-1", ...overrides };
}

function contract(overrides: Record<string, unknown> = {}) {
  return { id: "contract-1", status: "SIGNED", cancelledAt: null, ...overrides };
}

function obligation(overrides: Record<string, unknown> = {}) {
  return {
    sourceId: "contract-1",
    currencyCode: "USD",
    originalAmount: decimal("100"),
    outstandingAmount: decimal("0"),
    status: CommercialObligationStatus.SETTLED,
    settledAt,
    updatedAt: lastFinancialChangeAt,
    ...overrides,
  };
}

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

function context() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    contract: { findMany: jest.fn() },
    commercialObligation: { findMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
  };
  return { adapter: new ContractFinanceEligibilityAdapter(prisma as any), prisma, tx };
}
