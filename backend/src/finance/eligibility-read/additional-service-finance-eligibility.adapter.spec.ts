import { BadRequestException } from "@nestjs/common";
import { AccountReceivableStatus, Prisma } from "@prisma/client";
import { AdditionalServiceFinanceEligibilityAdapter } from "./additional-service-finance-eligibility.adapter";
import { financeEligibilitySourceKey } from "./finance-eligibility-reader.utils";

const settledAt = new Date("2026-10-01T12:00:00.000Z");
const updatedAt = new Date("2026-10-01T13:00:00.000Z");

describe("AdditionalServiceFinanceEligibilityAdapter", () => {
  it("returns ELIGIBLE only for an approved source with a settled zero-balance AR", async () => {
    const c = context();
    await expect(c.adapter.readMany(request())).resolves.toEqual([
      expect.objectContaining({ eligibility: "ELIGIBLE", reason: "SETTLED", financial: expect.objectContaining({ originalAmount: "100", outstandingAmount: "0", currency: "USD", financialStatus: "SETTLED", settledAt }) }),
    ]);
  });

  it.each([
    ["OPEN", authorityRow({ accountReceivableStatus: AccountReceivableStatus.OPEN, outstandingAmount: decimal("100"), settledAt: null })],
    ["PARTIALLY_SETTLED", authorityRow({ accountReceivableStatus: AccountReceivableStatus.PARTIALLY_SETTLED, outstandingAmount: decimal("25"), settledAt: null })],
    ["SETTLED with a nonzero balance", authorityRow({ outstandingAmount: decimal("0.00001") })],
    ["SETTLED without settledAt", authorityRow({ settledAt: null })],
  ])("blocks %s with OUTSTANDING_BALANCE", async (_case, row) => {
    const c = context({ rows: [row] });
    await expect(c.adapter.readMany(request())).resolves.toEqual([expect.objectContaining({ eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE" })]);
  });

  it.each([
    ["missing order", authorityRow({ orderId: null })],
    ["missing line", authorityRow({ lineId: null })],
    ["missing SalesOrder", authorityRow({ salesOrderId: null })],
    ["missing accepted BillingDocument", authorityRow({ billingDocumentId: null })],
    ["missing AccountReceivable", authorityRow({ accountReceivableSourceId: null })],
  ])("fails closed with FINANCIAL_DATA_MISSING for %s", async (_case, row) => {
    const c = context({ rows: [row] });
    await expect(c.adapter.readMany(request())).resolves.toEqual([expect.objectContaining({ eligibility: "BLOCKED", reason: "FINANCIAL_DATA_MISSING" })]);
  });

  it.each([
    ["cancelled order", authorityRow({ orderStatus: "CANCELLED" })],
    ["unapproved order", authorityRow({ commercialStatus: "REJECTED" })],
    ["line/order mismatch", authorityRow({ lineOrderId: "other-order" })],
    ["package mismatch", authorityRow({ orderTravelPackageId: "travel-b" })],
    ["inactive SalesOrder", authorityRow({ salesOrderStatus: "CANCELLED" })],
    ["cancelled AR", authorityRow({ accountReceivableStatus: AccountReceivableStatus.CANCELLED })],
  ])("fails closed with SOURCE_NOT_FINANCIALLY_ACTIVE for %s", async (_case, row) => {
    const c = context({ rows: [row] });
    await expect(c.adapter.readMany(request())).resolves.toEqual([expect.objectContaining({ eligibility: "BLOCKED", reason: "SOURCE_NOT_FINANCIALLY_ACTIVE" })]);
  });

  it("batches duplicate lines and independent orders through exactly one Finance authority query", async () => {
    const first = source();
    const second = source({ sourceId: "order-b", sourceLineId: "line-b" });
    const c = context({ rows: [authorityRow({}, first), authorityRow({ orderId: "order-b", lineId: "line-b", lineOrderId: "order-b", salesOrderId: "sales-b", billingDocumentId: "document-b", accountReceivableSourceId: "document-b" }, second)] });
    await expect(c.adapter.readMany({ tenantId: "tenant-a", sources: [first, first, second] })).resolves.toEqual([
      expect.objectContaining({ eligibility: "ELIGIBLE" }), expect.objectContaining({ eligibility: "ELIGIBLE" }),
    ]);
    expect(c.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("reads current AR state after a reversal instead of caching settlement", async () => {
    const c = context({ rows: [authorityRow()] });
    c.tx.$queryRaw.mockResolvedValueOnce([authorityRow()]).mockResolvedValueOnce([
      authorityRow({ accountReceivableStatus: AccountReceivableStatus.OPEN, outstandingAmount: decimal("100"), settledAt: null }),
    ]);
    await expect(c.adapter.readMany(request())).resolves.toEqual([expect.objectContaining({ eligibility: "ELIGIBLE" })]);
    await expect(c.adapter.readMany(request())).resolves.toEqual([expect.objectContaining({ eligibility: "BLOCKED", reason: "OUTSTANDING_BALANCE" })]);
  });

  it("requires package scope, preserves the batch limit, and uses only the tenant transaction client", async () => {
    const c = context();
    await expect(c.adapter.readMany({ tenantId: "tenant-a", sources: [source({ travelPackageId: undefined })] })).resolves.toEqual([expect.objectContaining({ reason: "FINANCIAL_DATA_MISSING" })]);
    await expect(c.adapter.readMany({ tenantId: "tenant-a", sources: Array.from({ length: 51 }, (_, index) => source({ sourceId: `order-${index}`, sourceLineId: `line-${index}` })) })).rejects.toBeInstanceOf(BadRequestException);
    expect(c.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(c.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

function request() { return { tenantId: "tenant-a", sources: [source()] }; }
function source(overrides: Record<string, unknown> = {}) { return { sourceType: "ADDITIONAL_SERVICE_ORDER_LINE", sourceId: "order-a", sourceLineId: "line-a", travelPackageId: "travel-a", ...overrides }; }
function authorityRow(overrides: Record<string, unknown> = {}, value = source()) {
  return {
    requestKey: financeEligibilitySourceKey(value), sourceLineId: value.sourceLineId ?? null, travelPackageId: value.travelPackageId ?? null,
    orderId: value.sourceId, orderTravelPackageId: value.travelPackageId, commercialStatus: "APPROVED", orderStatus: "CONFIRMED", proposalApprovedAt: settledAt,
    lineId: value.sourceLineId, lineOrderId: value.sourceId, salesOrderId: "sales-a", salesOrderStatus: "CREATED", billingDocumentId: "document-a",
    accountReceivableSourceId: "document-a", currencyCode: "USD", originalAmount: decimal("100"), outstandingAmount: decimal("0"),
    accountReceivableStatus: AccountReceivableStatus.SETTLED, settledAt, updatedAt, ...overrides,
  };
}
function decimal(value: string) { return new Prisma.Decimal(value); }
function context(overrides: Record<string, unknown> = {}) {
  const tx = { $executeRaw: jest.fn().mockResolvedValue(undefined), $queryRaw: jest.fn().mockResolvedValue(overrides.rows ?? [authorityRow()]) };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => unknown) => work(tx)) };
  return { adapter: new AdditionalServiceFinanceEligibilityAdapter(prisma as never), prisma, tx };
}
