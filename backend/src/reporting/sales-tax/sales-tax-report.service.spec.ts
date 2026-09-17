import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ReportingAccessPolicy } from "../access/reporting-access-policy";
import { ReportingPeriodResolver } from "../period/reporting-period.resolver";
import { ReportingSalesTaxApplicationService } from "./reporting-sales-tax-application.service";
import { SalesTaxReportService } from "./sales-tax-report.service";

describe("SalesTaxReportService", () => {
  const context = { tenantId: "tenant-a", actorUserId: "user-a", reportKey: "SALES_TAX" as const, timezone: "America/Guatemala" };
  const period = { startOn: "2026-02-01", endOn: "2026-02-28" };

  it("keeps CRC and USD separate and groups exact taxes by tax code, rate code, and rate", async () => {
    const documents = {
      readDocumentAggregates: jest.fn().mockResolvedValue([
        header("CRC", "INCREASE", 2, { exemptSales: "10.125", exoneratedSales: "4", grossTax: "13.01625", exoneratedTax: "1", taxCollected: "12.01625" }),
        header("CRC", "DECREASE", 1, { exemptSales: "1.125", exoneratedSales: "1", grossTax: "1.5", exoneratedTax: "0.2", taxCollected: "1.3" }),
        header("USD", "INCREASE", 1, { exemptSales: "0", exoneratedSales: "0", grossTax: "0.65", exoneratedTax: "0", taxCollected: "0.65" }),
      ]),
      readDocumentPage: jest.fn().mockResolvedValue({ items: [document("CRC")], totalItems: 4 }),
    };
    const taxes = {
      readTaxAggregation: jest.fn().mockResolvedValue([
        tax("CRC", "INCREASE", 2, "01", "08", "13", "100.125", "13.01625", "12.51625", "0.5"),
        tax("CRC", "DECREASE", 1, "01", "08", "13", "20.005", "2.60065", "2.50065", "0.1"),
        tax("USD", "INCREASE", 1, "01", "01", "13", "5", "0.65", "0.65"),
      ]),
    };
    const result = await new SalesTaxReportService(documents as never, taxes as never).execute(context, period, { page: 1, pageSize: 25 });

    expect(result.currencies).toEqual([
      expect.objectContaining({
        currencyCode: "CRC", documentCount: 3, exemptSales: "9", exoneratedSales: "3",
        grossTax: "11.51625", exoneratedTax: "0.8", taxCollected: "10.71625",
        taxGroups: [expect.objectContaining({ taxCode: "01", rateCode: "08", rate: "13", documentCount: 3, taxableBase: "80.12", grossTaxAmount: "10.4156", exemptionAmount: "0.4", taxCollected: "10.0156" })],
      }),
      expect.objectContaining({ currencyCode: "USD", taxGroups: [expect.objectContaining({ taxCode: "01", rateCode: "01", rate: "13", taxableBase: "5", taxCollected: "0.65" })] }),
    ]);
    expect(result.documents).toEqual([expect.objectContaining({ documentId: "document-CRC", taxes: [expect.objectContaining({ taxCode: "01" })] })]);
    expect(result.pagination).toEqual({ page: 1, pageSize: 25, totalItems: 4, totalPages: 1 });
  });

  it("omits per-rate exemption data when it was not explicitly persisted and keeps header exempt/exonerated values separate", async () => {
    const documents = { readDocumentAggregates: jest.fn().mockResolvedValue([header("CRC", "INCREASE", 1, { exemptSales: "20", exoneratedSales: "5", grossTax: "0", exoneratedTax: "0", taxCollected: "0" })]), readDocumentPage: jest.fn().mockResolvedValue({ items: [], totalItems: 1 }) };
    const taxes = { readTaxAggregation: jest.fn().mockResolvedValue([tax("CRC", "INCREASE", 1, "00", undefined, "0", "0", "0", "0")]) };
    const result = await new SalesTaxReportService(documents as never, taxes as never).execute(context, period, { page: 1, pageSize: 25 });

    expect(result.currencies[0]).toMatchObject({ exemptSales: "20", exoneratedSales: "5" });
    expect(result.currencies[0].taxGroups[0]).not.toHaveProperty("exemptionAmount");
    expect(result.currencies[0].taxGroups[0]).not.toHaveProperty("exemptBase");
    expect(result.currencies[0].taxGroups[0]).not.toHaveProperty("exoneratedBase");
  });

  it("returns a valid empty report and requests only a bounded tax detail page", async () => {
    const documents = { readDocumentAggregates: jest.fn().mockResolvedValue([]), readDocumentPage: jest.fn().mockResolvedValue({ items: [], totalItems: 0 }) };
    const taxes = { readTaxAggregation: jest.fn().mockResolvedValue([]) };
    const result = await new SalesTaxReportService(documents as never, taxes as never).execute(context, period, { page: 1, pageSize: 25 });

    expect(result.currencies).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(result.pagination).toEqual({ page: 1, pageSize: 25, totalItems: 0, totalPages: 0 });
    expect(documents.readDocumentPage).toHaveBeenCalledWith(context, period, { page: 1, pageSize: 25, includeTaxes: true });
  });

  it("uses tax filters for document existence and tax-group aggregation without inventing per-rate header bases", async () => {
    const documents = { readDocumentAggregates: jest.fn().mockResolvedValue([header("CRC", "INCREASE", 1, { exemptSales: "20", exoneratedSales: "5", grossTax: "15", exoneratedTax: "0", taxCollected: "15" })]), readDocumentPage: jest.fn().mockResolvedValue({ items: [document("CRC")], totalItems: 1 }) };
    const taxes = { readTaxAggregation: jest.fn().mockResolvedValue([tax("CRC", "INCREASE", 1, "01", "03", "2", "10", "0.2", "0.2")]) };
    const filter = { currencyCode: "CRC", taxCode: "01", rateCode: "03", rate: "2" } as const;
    const result = await new SalesTaxReportService(documents as never, taxes as never).execute(context, period, { page: 1, pageSize: 25, filter });

    expect(documents.readDocumentAggregates).toHaveBeenCalledWith(context, period, filter);
    expect(taxes.readTaxAggregation).toHaveBeenCalledWith(context, period, filter);
    expect(documents.readDocumentPage).toHaveBeenCalledWith(context, period, { page: 1, pageSize: 25, filter, includeTaxes: true });
    expect(result.headerTotalsScope).toBe("DOCUMENTS_MATCHING_TAX_FILTER");
    expect(result.currencies[0].taxGroups).toEqual([expect.objectContaining({ rateCode: "03", rate: "2", taxableBase: "10", taxCollected: "0.2" })]);
    expect(result.currencies[0].taxGroups[0]).not.toHaveProperty("exemptBase");
    expect(result.currencies[0].taxGroups[0]).not.toHaveProperty("exoneratedBase");
  });

  it("projects tax groups independently while retaining their rate identity and exact header totals", async () => {
    const projection = { sourceCurrencyCode: "USD", targetCurrencyCode: "CRC", rate: "500.123456789012", operation: "MULTIPLY" as const, rateAuthority: "BCCR", effectiveOn: "2026-02-10" };
    const documents = { readDocumentAggregates: jest.fn().mockResolvedValue([{ ...header("USD", "INCREASE", 1, { exemptSales: "2", exoneratedSales: "3", grossTax: "1.5", exoneratedTax: "0.1", taxCollected: "1.4" }), projection }]), readDocumentPage: jest.fn().mockResolvedValue({ items: [{ ...document("USD"), projection }], totalItems: 1 }) };
    const taxes = { readTaxAggregation: jest.fn().mockResolvedValue([
      { ...tax("USD", "INCREASE", 1, "01", "03", "2", "10", "0.2", "0.2"), projection },
      { ...tax("USD", "INCREASE", 1, "01", "08", "13", "10", "1.3", "1.3"), projection },
    ]) };
    const result = await new SalesTaxReportService(documents as never, taxes as never).execute(context, period, { page: 1, pageSize: 25, projection: { mode: "TARGET_CURRENCY", targetCurrencyCode: "CRC" } });
    expect(result).toMatchObject({ projectionMode: "CRC", presentationCurrencyCode: "CRC", currencies: [expect.objectContaining({ currencyCode: "CRC", exemptSales: "1000.246913578024", exoneratedSales: "1500.370370367036" })] });
    expect(result.currencies[0].taxGroups).toEqual(expect.arrayContaining([expect.objectContaining({ rate: "2", taxableBase: "5001.23456789012" }), expect.objectContaining({ rate: "13", taxableBase: "5001.23456789012" })]));
    expect(result.documents[0]).toMatchObject({ currencyCode: "CRC", originalCurrencyCode: "USD", projection });
  });

  it("uses ReportingAccessPolicy for ADMIN and CONTADOR and rejects all non-reporting roles", async () => {
    const salesTax = { execute: jest.fn().mockResolvedValue({ reportKey: "SALES_TAX" }) };
    const application = new ReportingSalesTaxApplicationService(
      { tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Guatemala" }) } } as never,
      new ReportingAccessPolicy(), new ReportingPeriodResolver(), salesTax as never,
    );
    for (const role of [UserRole.ADMIN, UserRole.CONTADOR]) {
      await expect(application.execute(request(role, "CURRENT_MONTH"))).resolves.toEqual({ reportKey: "SALES_TAX" });
    }
    for (const role of [UserRole.FACTURACION_COBROS, UserRole.OPERACIONES, UserRole.AGENT]) {
      await expect(application.execute(request(role, "CURRENT_MONTH"))).rejects.toThrow(ForbiddenException);
    }
  });

  it("derives tenant context and fiscal timezone for every supported period", async () => {
    const execute = jest.fn().mockResolvedValue({ reportKey: "SALES_TAX" });
    const application = new ReportingSalesTaxApplicationService(
      { tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Guatemala" }) } } as never,
      new ReportingAccessPolicy(), new ReportingPeriodResolver(), { execute } as never,
    );
    for (const kind of ["TODAY", "LAST_7_DAYS", "LAST_15_DAYS", "CURRENT_MONTH", "PREVIOUS_MONTH"] as const) await application.execute(request(UserRole.ADMIN, kind));
    await application.execute(request(UserRole.ADMIN, "CUSTOM"));
    expect(execute.mock.calls.every(([executionContext]) => executionContext.tenantId === "tenant-a" && executionContext.timezone === "America/Guatemala" && executionContext.reportKey === "SALES_TAX")).toBe(true);
  });

  it("has no fiscal persistence, legacy Billing, or travel-domain dependency", () => {
    const source = readFileSync(join(__dirname, "sales-tax-report.service.ts"), "utf8");
    for (const forbidden of ["BillingDocument", "BillingLineTax", "Contract", "SalesOrder", "AdditionalService", "Reservation", "billingInvoice", "billingPayment", "billingCreditNote", "@prisma/client"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  function request(role: UserRole, kind: "TODAY" | "LAST_7_DAYS" | "LAST_15_DAYS" | "CURRENT_MONTH" | "PREVIOUS_MONTH" | "CUSTOM") {
    return { tenantId: "tenant-a", actorUserId: "user-a", role, period: kind === "CUSTOM" ? { kind, startOn: "2026-02-02", endOn: "2026-02-11" } : { kind }, page: 1, pageSize: 25 } as const;
  }

  function header(currencyCode: string, effect: "INCREASE" | "DECREASE", documentCount: number, amounts: Record<string, string>) {
    return { currencyCode, effect, documentCount, amounts: { grossSales: "0", discounts: "0", taxableSales: "0", total: "0", ...amounts } };
  }

  function tax(currencyCode: string, effect: "INCREASE" | "DECREASE", documentCount: number, taxCode: string, rateCode: string | undefined, rate: string, taxableBase: string, grossTaxAmount: string, taxCollected: string, exemptionAmount?: string) {
    return { currencyCode, effect, documentCount, tax: { taxCode, ...(rateCode ? { rateCode } : {}), rate, taxableBase, grossTaxAmount, ...(exemptionAmount ? { exemptionAmount } : {}), taxCollected } };
  }

  function document(currencyCode: string) {
    return { documentId: `document-${currencyCode}`, documentNumber: "001", documentTypeCode: "01", effect: "INCREASE", status: "ACCEPTED", issuedOn: "2026-02-10", customer: { name: "Receiver", identificationType: "02", identification: "3101" }, currencyCode, amounts: { grossSales: "1", discounts: "0", taxableSales: "1", exemptSales: "0", exoneratedSales: "0", grossTax: "0.13", exoneratedTax: "0", taxCollected: "0.13", total: "1.13" }, taxes: [{ taxCode: "01", rateCode: "08", rate: "13", taxableBase: "1", grossTaxAmount: "0.13", taxCollected: "0.13" }] };
  }
});
