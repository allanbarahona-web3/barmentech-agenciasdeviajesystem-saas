import { BadRequestException } from "@nestjs/common";
import { AccountReceivableStatus, Prisma } from "@prisma/client";
import {
  CustomQuotationFinanceEligibilityAdapter,
} from "./custom-quotation-finance-eligibility.adapter";
import { financeEligibilitySourceKey } from "./finance-eligibility-reader.utils";

const settledAt = new Date("2026-10-02T12:00:00.000Z");
const updatedAt = new Date("2026-10-02T13:00:00.000Z");

describe("CustomQuotationFinanceEligibilityAdapter", () => {
  it("resolves an immutable version line through its SalesOrderLine and a fully settled accepted invoice", async () => {
    const c = context();

    await expect(c.adapter.readMany(request())).resolves.toEqual([
      expect.objectContaining({
        source: source(),
        eligibility: "ELIGIBLE",
        reason: "SETTLED",
        financial: expect.objectContaining({
          originalAmount: "300",
          outstandingAmount: "0",
          currency: "USD",
          financialStatus: "SETTLED",
          settledAt,
        }),
      }),
    ]);
    expect(c.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(c.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["open invoice", authorityRow({ accountReceivableStatus: AccountReceivableStatus.OPEN, outstandingAmount: decimal("300"), settledAt: null })],
    ["partially settled invoice", authorityRow({ accountReceivableStatus: AccountReceivableStatus.PARTIALLY_SETTLED, outstandingAmount: decimal("50"), settledAt: null })],
    ["settled status with a nonzero balance", authorityRow({ outstandingAmount: decimal("0.00001") })],
    ["settled status without settledAt", authorityRow({ settledAt: null })],
  ])("keeps every version line blocked for a %s", async (_case, row) => {
    const c = context({ rows: [row] });
    await expect(c.adapter.readMany(request())).resolves.toEqual([
      expect.objectContaining({ eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE" }),
    ]);
  });

  it("allows an accepted CASH electronic ticket without an AccountReceivable", async () => {
    const c = context({
      rows: [authorityRow({
        billingDocumentType: "04",
        billingDocumentTaxAuthorityStatus: "ACCEPTED",
        billingPaymentConditionCode: "01",
        billingCreditTermDays: null,
        accountReceivableSourceId: null,
        currencyCode: null,
        originalAmount: null,
        outstandingAmount: null,
        accountReceivableStatus: null,
        settledAt: null,
        updatedAt: null,
      })],
    });

    await expect(c.adapter.readMany(request())).resolves.toEqual([
      expect.objectContaining({ source: source(), eligibility: "ELIGIBLE", reason: "SETTLED" }),
    ]);
    expect(c.tx).not.toHaveProperty("accountReceivable");
  });

  it.each([
    ["not accepted", authorityRow({ billingDocumentType: "04", billingDocumentTaxAuthorityStatus: "PROCESSING", accountReceivableSourceId: null })],
    ["not CASH", authorityRow({ billingDocumentType: "04", billingPaymentConditionCode: "02", accountReceivableSourceId: null })],
    ["with a credit term", authorityRow({ billingDocumentType: "04", billingCreditTermDays: 30, accountReceivableSourceId: null })],
  ])("blocks an electronic ticket that is %s", async (_case, row) => {
    const c = context({ rows: [row] });
    await expect(c.adapter.readMany(request())).resolves.toEqual([
      expect.objectContaining({ eligibility: "BLOCKED", reason: "FINANCIAL_DATA_MISSING" }),
    ]);
  });

  it.each([
    ["missing immutable version line", authorityRow({ lineId: null })],
    ["missing SalesOrderLine", authorityRow({ salesOrderLineId: null })],
    ["missing SalesOrder", authorityRow({ salesOrderId: null })],
    ["missing accepted BillingDocument", authorityRow({ billingDocumentId: null })],
    ["missing AccountReceivable", authorityRow({ accountReceivableSourceId: null })],
    ["tenant-isolated source", undefined],
  ])("fails closed with FINANCIAL_DATA_MISSING for %s", async (_case, row) => {
    const c = context({ rows: row ? [row] : [] });
    await expect(c.adapter.readMany(request())).resolves.toEqual([
      expect.objectContaining({ eligibility: "BLOCKED", reason: "FINANCIAL_DATA_MISSING" }),
    ]);
  });

  it.each([
    ["line/version mismatch", authorityRow({ lineVersionId: "version-b" })],
    ["unaccepted quotation", authorityRow({ quotationStatus: "ISSUED" })],
    ["unaccepted version", authorityRow({ versionStatus: "ISSUED" })],
    ["wrong SalesOrder source", authorityRow({ salesOrderSourceId: "version-b" })],
    ["version/SalesOrder link mismatch", authorityRow({ versionSalesOrderId: "sales-b" })],
    ["SalesOrderLine total mismatch", authorityRow({ salesOrderLineTotal: decimal("99.99999") })],
    ["inactive SalesOrder", authorityRow({ salesOrderStatus: "CANCELLED" })],
    ["cancelled AR", authorityRow({ accountReceivableStatus: AccountReceivableStatus.CANCELLED })],
  ])("fails closed with SOURCE_NOT_FINANCIALLY_ACTIVE for %s", async (_case, row) => {
    const c = context({ rows: [row] });
    await expect(c.adapter.readMany(request())).resolves.toEqual([
      expect.objectContaining({ eligibility: "BLOCKED", reason: "SOURCE_NOT_FINANCIALLY_ACTIVE" }),
    ]);
  });

  it("retains each quotation line identity while applying the invoice-level settlement policy", async () => {
    const first = source();
    const second = source({ sourceLineId: "line-b" });
    const c = context({
      rows: [
        authorityRow({}, first),
        authorityRow({
          lineId: "line-b",
          salesOrderLineId: "sales-line-b",
          billingDocumentId: "document-a",
          accountReceivableSourceId: "document-a",
        }, second),
      ],
    });

    await expect(c.adapter.readMany({ tenantId: "tenant-a", sources: [first, first, second] })).resolves.toEqual([
      expect.objectContaining({ source: first, eligibility: "ELIGIBLE" }),
      expect.objectContaining({ source: second, eligibility: "ELIGIBLE" }),
    ]);
    expect(c.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("reads current AR state deterministically rather than caching settlement", async () => {
    const c = context();
    c.tx.$queryRaw
      .mockResolvedValueOnce([authorityRow()])
      .mockResolvedValueOnce([
        authorityRow({
          accountReceivableStatus: AccountReceivableStatus.OPEN,
          outstandingAmount: decimal("300"),
          settledAt: null,
        }),
      ]);
    await expect(c.adapter.readMany(request())).resolves.toEqual([
      expect.objectContaining({ eligibility: "ELIGIBLE" }),
    ]);
    await expect(c.adapter.readMany(request())).resolves.toEqual([
      expect.objectContaining({ eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE" }),
    ]);
  });

  it("requires a source line and preserves Finance batch limits", async () => {
    const c = context();
    await expect(c.adapter.readMany({ tenantId: "tenant-a", sources: [source({ sourceLineId: undefined })] })).resolves.toEqual([
      expect.objectContaining({ reason: "FINANCIAL_DATA_MISSING" }),
    ]);
    await expect(c.adapter.readMany({
      tenantId: "tenant-a",
      sources: Array.from({ length: 51 }, (_, index) => source({ sourceId: `version-${index}`, sourceLineId: `line-${index}` })),
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});

function request() {
  return { tenantId: "tenant-a", sources: [source()] };
}

function source(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: "CUSTOM_QUOTATION_LINE",
    sourceId: "version-a",
    sourceLineId: "line-a",
    ...overrides,
  };
}

function authorityRow(overrides: Record<string, unknown> = {}, value = source()) {
  return {
    requestKey: financeEligibilitySourceKey(value),
    sourceLineId: value.sourceLineId ?? null,
    versionId: value.sourceId,
    quotationId: "quotation-a",
    quotationStatus: "ACCEPTED",
    versionStatus: "ACCEPTED",
    versionSalesOrderId: "sales-a",
    lineId: value.sourceLineId,
    lineVersionId: value.sourceId,
    lineSoldAmount: decimal("100"),
    salesOrderLineId: "sales-line-a",
    lineSalesOrderId: "sales-a",
    salesOrderLineTotal: decimal("100"),
    salesOrderId: "sales-a",
    salesOrderSourceType: "CUSTOM_QUOTATION_VERSION",
    salesOrderSourceId: value.sourceId,
    salesOrderStatus: "CREATED",
    billingDocumentId: "document-a",
    billingDocumentType: "01",
    billingDocumentTaxAuthorityStatus: "ACCEPTED",
    billingPaymentConditionCode: "01",
    billingCreditTermDays: null,
    accountReceivableSourceId: "document-a",
    currencyCode: "USD",
    originalAmount: decimal("300"),
    outstandingAmount: decimal("0"),
    accountReceivableStatus: AccountReceivableStatus.SETTLED,
    settledAt,
    updatedAt,
    ...overrides,
  };
}

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

function context(overrides: Record<string, unknown> = {}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue(overrides.rows ?? [authorityRow()]),
  };
  const prisma = {
    $transaction: jest.fn(async (work: (transaction: typeof tx) => unknown) => work(tx)),
  };
  return {
    adapter: new CustomQuotationFinanceEligibilityAdapter(prisma as never),
    prisma,
    tx,
  };
}
