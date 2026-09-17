import * as ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ReportingExportService } from "./reporting-export.service";

describe("ReportingExportService", () => {
  const request = { tenantId: "tenant-a", actorUserId: "user-a", role: "ADMIN" as any, period: { kind: "CURRENT_MONTH" as const }, page: 3, pageSize: 25, filter: { saleCondition: "CREDIT" as const, currencyCode: "USD" }, projection: { mode: "TARGET_CURRENCY" as const, targetCurrencyCode: "CRC" } };
  it("renders Sales exports from the authorized full filtered report dataset and preserves projection", async () => {
    const execute = jest.fn().mockResolvedValue(sales()); const service = new ReportingExportService({ execute } as never, {} as never);
    const csv = await service.exportSales(request, "CSV"); const pdf = await service.exportSales(request, "PDF"); const xlsx = await service.exportSales(request, "XLSX");
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", filter: request.filter, projection: request.projection, page: 1, pageSize: 10_000 }));
    expect(csv).toMatchObject({ mimeType: "text/csv; charset=utf-8", fileName: "ventas-2026-09-01-a-2026-09-16.csv" }); expect(csv.bytes.toString("utf8")).toContain('\ufeffReporte,SALES'); expect(csv.bytes.toString("utf8")).toContain('"Cliente, ""Uno"""');
    expect(pdf).toMatchObject({ mimeType: "application/pdf", fileName: "ventas-2026-09-01-a-2026-09-16.pdf" }); expect(pdf.bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(xlsx).toMatchObject({ mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName: "ventas-2026-09-01-a-2026-09-16.xlsx" }); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(xlsx.bytes as any); expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Resumen", "Documentos"]); expect(workbook.getWorksheet("Resumen")!.getRow(8).values).toEqual(expect.arrayContaining(["Ventas brutas", "Impuesto exonerado", "Total facturado"])); expect(workbook.getWorksheet("Documentos")!.getRow(1).values).toEqual(expect.arrayContaining(["Ventas brutas", "Tasa fiscal", "Autoridad tasa"])); expect(workbook.getWorksheet("Documentos")!.views[0].state).toBe("frozen");
  });

  it("renders Sales Tax XLSX tax groups and rejects a dataset beyond the explicit safety cap", async () => {
    const execute = jest.fn().mockResolvedValue(salesTax()); const service = new ReportingExportService({} as never, { execute } as never);
    const xlsx = await service.exportSalesTax({ ...request, filter: { rate: "2" } }, "XLSX"); const csv = await service.exportSalesTax({ ...request, filter: { rate: "2" } }, "CSV"); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(xlsx.bytes as any); expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Resumen", "Impuestos por tarifa", "Documentos"]); expect(workbook.getWorksheet("Impuestos por tarifa")!.getRow(1).values).toEqual(expect.arrayContaining(["Código tarifa", "Tarifa %", "Exoneración"])); expect(csv.bytes.toString("utf8")).toContain("Código impuesto");
    execute.mockResolvedValue({ ...salesTax(), pagination: { page: 1, pageSize: 10_000, totalItems: 10_001, totalPages: 2 } }); await expect(service.exportSalesTax(request, "CSV")).rejects.toThrow("REPORTING_EXPORT_ROW_LIMIT_EXCEEDED");
  });

  it("renders the complete newest-first Receivables dataset through the authorized application service", async () => {
    const execute = jest.fn().mockResolvedValue(receivables()); const receivableRequest = { tenantId: "tenant-a", actorUserId: "user-a", role: "CONTADOR" as any, dueDate: { preset: "ALL" as const }, page: 3, pageSize: 25, filter: { currencyCode: "CRC", category: "PROJECTED_RECEIVABLE" as const, timing: "FUTURE" as const } }; const service = new ReportingExportService({} as never, {} as never, { execute } as never);
    const csv = await service.exportReceivables(receivableRequest, "CSV"); const pdf = await service.exportReceivables(receivableRequest, "PDF"); const xlsx = await service.exportReceivables(receivableRequest, "XLSX");
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", role: "CONTADOR", dueDate: receivableRequest.dueDate, filter: receivableRequest.filter, page: 1, pageSize: 10_000 }));
    expect(csv).toMatchObject({ mimeType: "text/csv; charset=utf-8", fileName: "cuentas-por-cobrar-all.csv" }); const text = csv.bytes.toString("utf8"); expect(text.startsWith("\ufeff")).toBe(true); expect(text).toContain("CxC facturada"); expect(text).toContain("Obligación contractual"); expect(text.indexOf("NUEVA")).toBeLessThan(text.indexOf('"ANTIGUA, ""referencia"""'));
    expect(pdf.bytes.subarray(0, 4).toString()).toBe("%PDF"); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(xlsx.bytes as any); expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Resumen", "Cuentas por cobrar"]); expect(workbook.getWorksheet("Resumen")!.getRow(8).values).toEqual(expect.arrayContaining(["CxC facturada pendiente", "Obligación contractual sin fecha"])); expect(workbook.getWorksheet("Cuentas por cobrar")!.getRow(1).values).toEqual(expect.arrayContaining(["Monto original", "Estado financiero"])); expect(workbook.getWorksheet("Cuentas por cobrar")!.views[0].state).toBe("frozen");
  });

  it("keeps Receivables export bounded and free of persistence reads", async () => {
    const execute = jest.fn().mockResolvedValue({ ...receivables(), pagination: { page: 1, pageSize: 10_000, totalItems: 10_001, totalPages: 2 } }); const service = new ReportingExportService({} as never, {} as never, { execute } as never);
    await expect(service.exportReceivables({ tenantId: "tenant-a", actorUserId: "user-a", role: "ADMIN" as any, dueDate: { preset: "ALL" }, page: 1, pageSize: 25 }, "CSV")).rejects.toThrow("REPORTING_EXPORT_ROW_LIMIT_EXCEEDED");
  });

  it("keeps presentation adapters free of fiscal reads and provides a business PDF layout", () => {
    const source = readFileSync(join(__dirname, "reporting-export.service.ts"), "utf8");
    for (const value of ["Reporte de ventas", "Impuestos sobre ventas", "Período:", "Vista monetaria:", "Condición de venta", "Ventas brutas", "Impuesto exonerado", "Detalle de documentos", "Impuestos por tarifa", "Aumenta ventas", "Disminuye ventas", "Página ${index + 1} de ${pages.length}", "function money", "if (y < 58)"]) expect(source).toContain(value);
    for (const forbidden of ["BillingDocument", "findMany", "exchangeRateResolver", "convertCurrency", "settlement"]) expect(source).not.toContain(forbidden);
  });

  it("paginates long PDF detail and retains the repeatable table-header drawing path", async () => {
    const report = sales(); report.documents = Array.from({ length: 80 }, (_, index) => ({ ...document(), documentNumber: `001-${index}`, customer: { name: `Cliente con nombre extenso ${index}` } })); report.pagination = { page: 1, pageSize: 10_000, totalItems: 80, totalPages: 1 };
    const service = new ReportingExportService({ execute: jest.fn().mockResolvedValue(report) } as never, {} as never);
    const exported = await service.exportSales(request, "PDF");
    expect((await PDFDocument.load(exported.bytes)).getPageCount()).toBeGreaterThan(1);
    expect(readFileSync(join(__dirname, "reporting-export.service.ts"), "utf8")).toContain("if (y < 58) { start(); drawHeader(); }");
  });
});

function document() { return { documentId: "document-a", documentNumber: "001", issuedOn: "2026-09-16", customer: { name: 'Cliente, "Uno"' }, currencyCode: "CRC", originalCurrencyCode: "USD", originalAmounts: amounts("113"), projection: { rate: "500.123456789012", effectiveOn: "2026-09-16", rateAuthority: "BCCR" }, total: "56513.9506171356", taxes: [{ taxCode: "01", rate: "13", taxCollected: "6500" }] }; }
function amounts(total = "113") { return { grossSales: "100", discounts: "0", taxableSales: "100", exemptSales: "0", exoneratedSales: "0", grossTax: "13", exoneratedTax: "0", taxCollected: "13", total }; }
function sales() { return { reportKey: "SALES", period: { startOn: "2026-09-01", endOn: "2026-09-16" }, generatedAt: "2026-09-16T12:00:00.000Z", projectionMode: "CRC", presentationCurrencyCode: "CRC", currencies: [{ currencyCode: "CRC", documentCount: 1, ...amounts("56513.9506171356") }], documents: [document()], pagination: { page: 1, pageSize: 10_000, totalItems: 1, totalPages: 1 } }; }
function salesTax() { return { ...sales(), reportKey: "SALES_TAX", headerTotalsScope: "ALL_FILTERED_DOCUMENTS", currencies: [{ currencyCode: "CRC", documentCount: 1, exemptSales: "0", exoneratedSales: "0", grossTax: "6500", exoneratedTax: "0", taxCollected: "6500", taxGroups: [{ taxCode: "01", rate: "13", taxableBase: "50000", grossTaxAmount: "6500", taxCollected: "6500", documentCount: 1 }] }] }; }
function receivables() { return { reportKey: "RECEIVABLES", period: { startOn: "2026-09-16", endOn: "2026-09-16" }, generatedAt: "2026-09-16T12:00:00.000Z", asOfDate: "2026-09-16", currencies: [{ currencyCode: "CRC", recognizedOutstanding: "100", projectedOutstanding: "200", overdueRecognized: "10", overdueProjected: "20", noDateRecognized: "0", noDateProjected: "30" }, { currencyCode: "USD", recognizedOutstanding: "50", projectedOutstanding: "60", overdueRecognized: "0", overdueProjected: "0", noDateRecognized: "0", noDateProjected: "0" }], rows: [{ opaqueId: "z", category: "RECOGNIZED_RECEIVABLE", reference: "NUEVA", createdOn: "2026-09-16", dueOn: "2026-12-31", currencyCode: "CRC", originalAmount: "100", appliedAmount: "0", outstandingAmount: "100", status: "OPEN", collectionTiming: "FUTURE" }, { opaqueId: "a", category: "PROJECTED_RECEIVABLE", reference: 'ANTIGUA, "referencia"', createdOn: "2026-09-01", currencyCode: "USD", originalAmount: "60", appliedAmount: "10", outstandingAmount: "50", status: "PARTIALLY_SETTLED", collectionTiming: "NO_PROJECTABLE_DATE" }], pagination: { page: 1, pageSize: 10_000, totalItems: 2, totalPages: 1 } }; }
