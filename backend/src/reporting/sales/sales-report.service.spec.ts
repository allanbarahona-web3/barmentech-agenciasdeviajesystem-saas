import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ReportingAccessPolicy } from "../access/reporting-access-policy";
import { ReportingPeriodResolver } from "../period/reporting-period.resolver";
import { ReportingSalesApplicationService } from "./reporting-sales-application.service";
import { SalesReportService } from "./sales-report.service";

describe("SalesReportService", () => {
  const context = { tenantId: "tenant-a", actorUserId: "user-a", reportKey: "SALES" as const, timezone: "America/Guatemala" };
  const period = { startOn: "2026-02-01", endOn: "2026-02-28" };

  it("keeps CRC and USD separate, adds increases, and subtracts decreases exactly", async () => {
    const reader = readerWith({
      aggregates: [
        aggregate("CRC", "INCREASE", 2, { grossSales: "100.12500", discounts: "10.01250", taxableSales: "100.12500", exemptSales: "4", exoneratedSales: "2", grossTax: "13.01625", exoneratedTax: "0.5", taxCollected: "12.51625", total: "112.64125" }),
        aggregate("CRC", "DECREASE", 1, { grossSales: "20.00500", discounts: "2.00050", taxableSales: "20.00500", exemptSales: "1", exoneratedSales: "0", grossTax: "2.60065", exoneratedTax: "0.1", taxCollected: "2.50065", total: "22.50565" }),
        aggregate("USD", "INCREASE", 1, { grossSales: "5.50000", discounts: "0", taxableSales: "5.50000", exemptSales: "0", exoneratedSales: "0", grossTax: "0.71500", exoneratedTax: "0", taxCollected: "0.71500", total: "6.21500" }),
      ],
      page: { items: [document("CRC")], totalItems: 4 },
    });
    const result = await new SalesReportService(reader as never).execute(context, period, { page: 1, pageSize: 25 });

    expect(result.currencies).toEqual([
      expect.objectContaining({ currencyCode: "CRC", documentCount: 3, grossSales: "80.12", discounts: "8.012", taxableSales: "80.12", exemptSales: "3", exoneratedSales: "2", grossTax: "10.4156", exoneratedTax: "0.4", taxCollected: "10.0156", total: "90.1356" }),
      expect.objectContaining({ currencyCode: "USD", documentCount: 1, grossSales: "5.5", total: "6.215" }),
    ]);
    expect(result.documents).toEqual([expect.objectContaining({ documentId: "document-CRC", customer: expect.any(Object) })]);
    expect(result.pagination).toEqual({ page: 1, pageSize: 25, totalItems: 4, totalPages: 1 });
  });

  it("returns a valid empty report and applies the default detail page size supplied by the API", async () => {
    const reader = readerWith({ aggregates: [], page: { items: [], totalItems: 0 } });
    const result = await new SalesReportService(reader as never).execute(context, period, { page: 1, pageSize: 25 });
    expect(result.currencies).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(result.pagination).toEqual({ page: 1, pageSize: 25, totalItems: 0, totalPages: 0 });
    expect(reader.readDocumentPage).toHaveBeenCalledWith(context, period, { page: 1, pageSize: 25 });
  });

  it("passes one generic filter unchanged to both Sales summary and bounded detail reads", async () => {
    const reader = readerWith({ aggregates: [], page: { items: [], totalItems: 0 } });
    const filter = { saleCondition: "CREDIT" as const, currencyCode: "USD" };
    await new SalesReportService(reader as never).execute(context, period, { page: 2, pageSize: 25, filter });
    expect(reader.readDocumentAggregates).toHaveBeenCalledWith(context, period, filter);
    expect(reader.readDocumentPage).toHaveBeenCalledWith(context, period, { page: 2, pageSize: 25, filter });
  });

  it("projects each fiscal aggregate and detail document to the requested target before aggregation without rounding", async () => {
    const usdProjection = { sourceCurrencyCode: "USD", targetCurrencyCode: "CRC", rate: "500.123456789012", operation: "MULTIPLY" as const, rateAuthority: "BCCR", effectiveOn: "2026-02-10" };
    const reader = readerWith({
      aggregates: [
        { ...aggregate("USD", "INCREASE", 1, { grossSales: "1.00000", discounts: "0", taxableSales: "1.00000", exemptSales: "0", exoneratedSales: "0", grossTax: "0.13", exoneratedTax: "0", taxCollected: "0.13", total: "1.13" }), projection: usdProjection },
        { ...aggregate("USD", "INCREASE", 1, { grossSales: "1.00000", discounts: "0", taxableSales: "1.00000", exemptSales: "0", exoneratedSales: "0", grossTax: "0.13", exoneratedTax: "0", taxCollected: "0.13", total: "1.13" }), projection: { ...usdProjection, rate: "600" } },
      ],
      page: { items: [{ ...document("USD"), projection: usdProjection }], totalItems: 2 },
    });
    const result = await new SalesReportService(reader as never).execute(context, period, { page: 1, pageSize: 25, projection: { mode: "TARGET_CURRENCY", targetCurrencyCode: "CRC" } });
    expect(result).toMatchObject({ projectionMode: "CRC", presentationCurrencyCode: "CRC", currencies: [expect.objectContaining({ currencyCode: "CRC", grossSales: "1100.123456789012" })] });
    expect(result.documents[0]).toMatchObject({ currencyCode: "CRC", originalCurrencyCode: "USD", originalAmounts: expect.objectContaining({ grossSales: "1" }), projection: usdProjection, grossSales: "500.123456789012" });
  });

  it("uses ReportingAccessPolicy for ADMIN and CONTADOR and rejects FACTURACION_COBROS and AGENT", async () => {
    const sales = { execute: jest.fn().mockResolvedValue({ reportKey: "SALES" }) };
    const application = new ReportingSalesApplicationService(
      { tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Guatemala" }) } } as never,
      new ReportingAccessPolicy(), new ReportingPeriodResolver(), sales as never,
    );
    for (const role of [UserRole.ADMIN, UserRole.CONTADOR]) {
      await expect(application.execute(request(role, "CURRENT_MONTH"))).resolves.toEqual({ reportKey: "SALES" });
    }
    for (const role of [UserRole.FACTURACION_COBROS, UserRole.AGENT]) {
      await expect(application.execute(request(role, "CURRENT_MONTH"))).rejects.toThrow(ForbiddenException);
    }
  });

  it("derives tenant context and timezone server-side for TODAY, CURRENT_MONTH, PREVIOUS_MONTH, and CUSTOM", async () => {
    const execute = jest.fn().mockResolvedValue({ reportKey: "SALES" });
    const application = new ReportingSalesApplicationService(
      { tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Guatemala" }) } } as never,
      new ReportingAccessPolicy(), new ReportingPeriodResolver(), { execute } as never,
    );
    for (const kind of ["TODAY", "CURRENT_MONTH", "PREVIOUS_MONTH"] as const) {
      await application.execute(request(UserRole.ADMIN, kind));
    }
    await application.execute({ ...request(UserRole.ADMIN, "CUSTOM"), period: { kind: "CUSTOM", startOn: "2026-02-02", endOn: "2026-02-11" } });
    expect(execute.mock.calls.every(([executionContext]) => executionContext.tenantId === "tenant-a" && executionContext.timezone === "America/Guatemala")).toBe(true);
  });

  function request(role: UserRole, kind: "TODAY" | "CURRENT_MONTH" | "PREVIOUS_MONTH" | "CUSTOM") {
    return { tenantId: "tenant-a", actorUserId: "user-a", role, period: kind === "CUSTOM" ? { kind, startOn: "2026-02-02", endOn: "2026-02-11" } : { kind }, page: 1, pageSize: 25 } as const;
  }

  function readerWith(input: { aggregates: unknown[]; page: { items: unknown[]; totalItems: number } }) {
    return { readDocumentAggregates: jest.fn().mockResolvedValue(input.aggregates), readDocumentPage: jest.fn().mockResolvedValue(input.page) };
  }

  function aggregate(currencyCode: string, effect: "INCREASE" | "DECREASE", documentCount: number, amounts: Record<string, string>) {
    return { currencyCode, effect, documentCount, amounts };
  }

  function document(currencyCode: string) {
    return { documentId: `document-${currencyCode}`, documentNumber: "001", documentTypeCode: "01", effect: "INCREASE", status: "ACCEPTED", issuedOn: "2026-02-10", customer: { name: "Receiver", identificationType: "02", identification: "3101" }, currencyCode, amounts: { grossSales: "1", discounts: "0", taxableSales: "1", exemptSales: "0", exoneratedSales: "0", grossTax: "0.13", exoneratedTax: "0", taxCollected: "0.13", total: "1.13" }, taxes: [] };
  }
});
