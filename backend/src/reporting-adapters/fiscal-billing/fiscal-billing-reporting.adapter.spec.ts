import { BillingTaxAuthorityStatus } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FiscalBillingReportingAdapter } from "./fiscal-billing-reporting.adapter";

describe("FiscalBillingReportingAdapter", () => {
  const context = {
    tenantId: "tenant-a",
    actorUserId: "user-a",
    reportKey: "SALES" as const,
    timezone: "America/Guatemala",
  };
  const period = { startOn: "2026-02-01", endOn: "2026-02-28" };

  it("scopes reads to the authenticated tenant and accepted fiscal documents", async () => {
    const rows = [document({ id: "a", tenantId: "tenant-a" }), document({ id: "b", tenantId: "tenant-b" })];
    const findMany = jest.fn(async ({ where }: { where: { tenantId: string; taxAuthorityStatus: BillingTaxAuthorityStatus } }) =>
      rows.filter((row) => row.tenantId === where.tenantId && where.taxAuthorityStatus === BillingTaxAuthorityStatus.ACCEPTED),
    );
    const adapter = subject(findMany);

    await expect(adapter.readDocuments(context, period)).resolves.toMatchObject([{ documentId: "a" }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      tenantId: "tenant-a",
      taxAuthorityStatus: BillingTaxAuthorityStatus.ACCEPTED,
      fiscalIssueDate: { gte: new Date("2026-02-01T00:00:00.000Z"), lte: new Date("2026-02-28T00:00:00.000Z") },
    }) }));
  });

  it("does not allow period filters to bypass tenant scope", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await subject(findMany).readDocuments({ ...context, tenantId: "tenant-a" }, { startOn: "2026-01-01", endOn: "2026-12-31" });
    expect(findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "tenant-a" });
  });

  it("maps only accepted modern documents and maps invoice and ticket to INCREASE", async () => {
    const accepted = [document({ documentTypeCode: "01" }), document({ id: "ticket", fiscalNumber: "002", documentTypeCode: "04" })];
    const findMany = jest.fn().mockResolvedValue(accepted);
    const results = await subject(findMany).readDocuments(context, period);

    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ documentNumber: "001", effect: "INCREASE", status: "ACCEPTED" }),
      expect.objectContaining({ documentNumber: "002", effect: "INCREASE", status: "ACCEPTED" }),
    ]));
  });

  it("preserves fiscal money and tax values as exact decimal strings", async () => {
    const result = await subject(jest.fn().mockResolvedValue([document()])).readDocuments(context, period);
    expect(result[0]).toMatchObject({
      amounts: { grossSales: "100.12500", taxCollected: "13.01625", total: "113.14125" },
      taxes: [{ rate: "13", taxableBase: "100.12500", grossTaxAmount: "13.01625", taxCollected: "13.01625" }],
    });
    expect(typeof result[0].amounts.total).toBe("string");
    expect(typeof result[0].taxes[0].rate).toBe("string");
  });

  it("does not depend on legacy Billing models", () => {
    const source = readFileSync(join(__dirname, "fiscal-billing-reporting.adapter.ts"), "utf8");
    for (const legacy of ["billingInvoice", "billingPayment", "billingCreditNote"]) {
      expect(source).not.toContain(legacy);
    }
  });

  it("uses one set-based grouping query for summaries and bounded count/page queries for detail", async () => {
    const groupBy = jest.fn().mockResolvedValue([{
      currencyCode: "CRC", documentTypeCode: "01", _count: { _all: 2 },
      _sum: { grossSubtotal: "100", discountTotal: "0", taxableTotal: "100", exemptTotal: "0", exoneratedTotal: "0", grossTaxTotal: "13", exoneratedTaxTotal: "0", netTaxTotal: "13", total: "113" },
    }]);
    const count = jest.fn().mockResolvedValue(31);
    const findMany = jest.fn().mockResolvedValue([document()]);
    const adapter = new FiscalBillingReportingAdapter({ billingDocument: { groupBy, count, findMany } } as never);

    await expect(adapter.readDocumentAggregates(context, period)).resolves.toEqual([expect.objectContaining({ currencyCode: "CRC", documentCount: 2 })]);
    await expect(adapter.readDocumentPage(context, period, { page: 2, pageSize: 25 })).resolves.toMatchObject({ totalItems: 31, items: [{ documentNumber: "001" }] });
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 25, take: 25 }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ fiscalIssueDate: "desc" }, { fiscalEmissionAt: "desc" }, { id: "desc" }] }));
    expect(findMany.mock.calls[0][0].select).not.toHaveProperty("lines");
  });

  it("maps generic Cash/Credit and currency filters into the same accepted-document scope for summaries and detail", async () => {
    const groupBy = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const findMany = jest.fn().mockResolvedValue([]);
    const adapter = new FiscalBillingReportingAdapter({ billingDocument: { groupBy, count, findMany } } as never);
    const filter = { saleCondition: "CASH" as const, currencyCode: "USD" };

    await adapter.readDocumentAggregates(context, period, filter);
    await adapter.readDocumentPage(context, period, { page: 1, pageSize: 25, filter });
    for (const where of [groupBy.mock.calls[0][0].where, count.mock.calls[0][0].where, findMany.mock.calls[0][0].where]) {
      expect(where).toMatchObject({ tenantId: "tenant-a", taxAuthorityStatus: BillingTaxAuthorityStatus.ACCEPTED, paymentConditionCode: "01", currencyCode: "USD" });
    }
  });

  it("uses newest-first fiscal ordering, with fiscal emission and id tie breakers, for generic detail pages", async () => {
    const count = jest.fn().mockResolvedValue(4);
    const findMany = jest.fn().mockResolvedValue([
      document({ id: "newest", fiscalNumber: "004", fiscalIssueDate: new Date("2026-09-15T00:00:00.000Z"), fiscalEmissionAt: new Date("2026-09-15T14:00:00.000Z") }),
      document({ id: "same-day-later", fiscalNumber: "003", fiscalIssueDate: new Date("2026-09-15T00:00:00.000Z"), fiscalEmissionAt: new Date("2026-09-15T13:00:00.000Z") }),
      document({ id: "middle", fiscalNumber: "002", fiscalIssueDate: new Date("2026-09-14T00:00:00.000Z"), fiscalEmissionAt: new Date("2026-09-14T14:00:00.000Z") }),
      document({ id: "oldest", fiscalNumber: "001", fiscalIssueDate: new Date("2026-09-07T00:00:00.000Z"), fiscalEmissionAt: new Date("2026-09-07T14:00:00.000Z") }),
    ]);
    const adapter = new FiscalBillingReportingAdapter({ billingDocument: { count, findMany } } as never);

    const page = await adapter.readDocumentPage(context, { startOn: "2026-09-01", endOn: "2026-09-30" }, { page: 1, pageSize: 25 });
    expect(page.items.map((item) => item.issuedOn)).toEqual(["2026-09-15", "2026-09-15", "2026-09-14", "2026-09-07"]);
    expect(page.items.map((item) => item.documentId)).toEqual(["newest", "same-day-later", "middle", "oldest"]);
    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ fiscalIssueDate: "desc" }, { fiscalEmissionAt: "desc" }, { id: "desc" }]);
  });

  it("adds tax-line existence filters to document headers/detail and exact tax predicates to the set-based tax query", async () => {
    const groupBy = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const findMany = jest.fn().mockResolvedValue([]);
    const $queryRaw = jest.fn().mockResolvedValue([]);
    const adapter = new FiscalBillingReportingAdapter({ billingDocument: { groupBy, count, findMany }, $queryRaw } as never);
    const filter = { currencyCode: "CRC", taxCode: "01", rateCode: "03", rate: "2" };

    await adapter.readDocumentAggregates(context, period, filter);
    await adapter.readDocumentPage(context, period, { page: 1, pageSize: 25, filter, includeTaxes: true });
    await adapter.readTaxAggregation(context, period, filter);
    for (const where of [groupBy.mock.calls[0][0].where, count.mock.calls[0][0].where, findMany.mock.calls[0][0].where]) {
      expect(where).toMatchObject({ currencyCode: "CRC", lines: { some: { taxes: { some: { taxCode: "01", rateCode: "03", ratePercentage: expect.anything() } } } } });
    }
    expect($queryRaw).toHaveBeenCalledTimes(1);
    const source = readFileSync(join(__dirname, "fiscal-billing-reporting.adapter.ts"), "utf8");
    expect(source).toContain('AND tax."taxCode" = ${filter.taxCode}');
    expect(source).toContain('AND tax."rateCode" = ${filter.rateCode}');
    expect(source).toContain('AND tax."ratePercentage" = ${new Prisma.Decimal(filter.rate)}');
  });

  it("uses one tenant-scoped set-based tax query with an enum-typed accepted-status parameter", async () => {
    const $queryRaw = jest.fn().mockResolvedValue([{
      currencyCode: "CRC", documentTypeCode: "01", taxCode: "01", rateCode: "08", rate: "13",
      documentCount: 2n, taxableBase: "100.12500", grossTaxAmount: "13.01625", exemptionAmount: "0.50000", taxCollected: "12.51625",
    }]);
    const adapter = new FiscalBillingReportingAdapter({ $queryRaw } as never);

    await expect(adapter.readTaxAggregation(context, period)).resolves.toEqual([expect.objectContaining({
      currencyCode: "CRC", effect: "INCREASE", documentCount: 2,
      tax: expect.objectContaining({ taxCode: "01", rateCode: "08", rate: "13", taxableBase: "100.12500", grossTaxAmount: "13.01625", exemptionAmount: "0.50000", taxCollected: "12.51625" }),
    })]);
    expect($queryRaw).toHaveBeenCalledTimes(1);
    const source = readFileSync(join(__dirname, "fiscal-billing-reporting.adapter.ts"), "utf8");
    expect(source).toContain('document."taxAuthorityStatus" = ${BillingTaxAuthorityStatus.ACCEPTED}::"BillingTaxAuthorityStatus"');
    expect(source).toContain('document."tenantId" = ${context.tenantId}');
    expect(source).toContain('document."fiscalIssueDate" >= ${dateOnly(period.startOn)}');
    expect(source).toContain('document."fiscalIssueDate" <= ${dateOnly(period.endOn)}');
    expect(source).toContain('GROUP BY document."currencyCode", document."documentTypeCode", document."exchangeRate", document."fiscalExchangeRateEffectiveDate", document."fiscalExchangeRateSourceAuthority", tax."taxCode", tax."rateCode", tax."ratePercentage"');
  });

  function subject(findMany: jest.Mock) {
    return new FiscalBillingReportingAdapter({ billingDocument: { findMany } } as never);
  }

  function document(overrides: Record<string, unknown> = {}) {
    return {
      id: "document-a",
      tenantId: "tenant-a",
      fiscalNumber: "001",
      haciendaKey: "key-a",
      documentTypeCode: "01",
      fiscalIssueDate: new Date("2026-02-10T00:00:00.000Z"),
      taxAuthorityFinalizedAt: new Date("2026-02-10T12:00:00.000Z"),
      receiverName: "Receiver",
      receiverIdentificationType: "02",
      receiverIdentification: "3101000000",
      currencyCode: "CRC",
      grossSubtotal: "100.12500",
      discountTotal: "0",
      taxableTotal: "100.12500",
      exemptTotal: "0",
      exoneratedTotal: "0",
      grossTaxTotal: "13.01625",
      exoneratedTaxTotal: "0",
      netTaxTotal: "13.01625",
      total: "113.14125",
      lines: [{ taxes: [{ taxCode: "01", rateCode: "08", ratePercentage: "13", taxableBase: "100.12500", taxAmount: "13.01625", netTaxAmount: "13.01625", exemption: null }] }],
      ...overrides,
    };
  }
});
