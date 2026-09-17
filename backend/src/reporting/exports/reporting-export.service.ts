import { BadRequestException, Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { AuthenticatedSalesReportRequest } from "../sales/reporting-sales-application.service";
import { ReportingSalesApplicationService } from "../sales/reporting-sales-application.service";
import type { AuthenticatedSalesTaxReportRequest } from "../sales-tax/reporting-sales-tax-application.service";
import { ReportingSalesTaxApplicationService } from "../sales-tax/reporting-sales-tax-application.service";
import type { AuthenticatedReceivablesReportRequest } from "../receivables/reporting-receivables-application.service";
import { ReportingReceivablesApplicationService } from "../receivables/reporting-receivables-application.service";

export type ReportingExportFormat = "PDF" | "XLSX" | "CSV";
export type ReportingExport = { bytes: Buffer; mimeType: string; fileName: string };
const MAX_EXPORT_ROWS = 10_000;

/** Presentation-only adapters over the existing authorized report datasets. */
@Injectable()
export class ReportingExportService {
  constructor(private readonly sales: ReportingSalesApplicationService, private readonly salesTax: ReportingSalesTaxApplicationService, private readonly receivables: ReportingReceivablesApplicationService = {} as ReportingReceivablesApplicationService) {}

  async exportSales(request: AuthenticatedSalesReportRequest, format: ReportingExportFormat): Promise<ReportingExport> {
    const report = await this.sales.execute({ ...request, page: 1, pageSize: MAX_EXPORT_ROWS });
    assertExportBound(report.pagination.totalItems);
    return render("ventas", report, format, false, request.filter);
  }

  async exportSalesTax(request: AuthenticatedSalesTaxReportRequest, format: ReportingExportFormat): Promise<ReportingExport> {
    const report = await this.salesTax.execute({ ...request, page: 1, pageSize: MAX_EXPORT_ROWS });
    assertExportBound(report.pagination.totalItems);
    return render("impuestos-ventas", report, format, true, request.filter);
  }

  async exportReceivables(request: AuthenticatedReceivablesReportRequest, format: ReportingExportFormat): Promise<ReportingExport> {
    const report = await this.receivables.execute({ ...request, page: 1, pageSize: MAX_EXPORT_ROWS });
    assertExportBound(report.pagination.totalItems);
    return renderReceivables(report, request, format);
  }
}

function assertExportBound(total: number) { if (total > MAX_EXPORT_ROWS) throw new BadRequestException("REPORTING_EXPORT_ROW_LIMIT_EXCEEDED"); }

async function render(prefix: string, report: any, format: ReportingExportFormat, tax: boolean, filter?: object): Promise<ReportingExport> {
  const fileName = `${prefix}-${periodName(report.period)}.${format.toLowerCase()}`;
  if (format === "PDF") return { bytes: await renderPdf(report, tax, filter), mimeType: "application/pdf", fileName };
  if (format === "XLSX") return { bytes: await renderXlsx(report, tax), mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName };
  return { bytes: Buffer.from(`\ufeff${renderCsv(report, tax)}`, "utf8"), mimeType: "text/csv; charset=utf-8", fileName };
}

function metadata(report: any, filter?: object) { return [
  ["Reporte", report.reportKey], ["Periodo", `${report.period.startOn} a ${report.period.endOn}`], ["Vista monetaria", report.projectionMode], ["Moneda de presentación", report.presentationCurrencyCode ?? "Original"], ["Filtros", filter && Object.keys(filter).length ? Object.entries(filter).map(([key, value]) => `${key}: ${value}`).join(" · ") : "Todos"], ["Generado", report.generatedAt],
]; }

async function renderPdf(report: any, tax: boolean, filter?: object): Promise<Buffer> {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold); const pages: any[] = []; let page: any; let y = 0;
  const start = () => { page = pdf.addPage([842, 595]); pages.push(page); y = 530; page.drawRectangle({ x: 0, y: 545, width: 842, height: 50, color: rgb(0.08, 0.28, 0.55) }); page.drawText(tax ? "Impuestos sobre ventas" : "Reporte de ventas", { x: 34, y: 565, size: 17, font: bold, color: rgb(1, 1, 1) }); };
  const ensure = (height: number) => { if (y - height < 45) start(); };
  const heading = (text: string) => { ensure(22); page.drawText(text, { x: 34, y, size: 11, font: bold, color: rgb(0.08, 0.28, 0.55) }); y -= 18; };
  const text = (value: string, size = 8) => { ensure(13); page.drawText(value.slice(0, 180), { x: 34, y, size, font, color: rgb(0.12, 0.16, 0.25) }); y -= 12; };
  const table = (headers: string[], widths: number[], rows: string[][]) => { const drawHeader = () => { if (y < 75) start(); let x = 34; headers.forEach((h, i) => { page.drawRectangle({ x, y: y - 3, width: widths[i], height: 15, color: rgb(0.08, 0.28, 0.55) }); page.drawText(h, { x: x + 3, y: y + 1, size: 6.5, font: bold, color: rgb(1, 1, 1) }); x += widths[i]; }); y -= 18; }; drawHeader(); rows.forEach((row) => { if (y < 58) { start(); drawHeader(); } let x = 34; row.forEach((value, i) => { page.drawText(fit(value, widths[i], font, 6.7), { x: x + 3, y, size: 6.7, font, color: rgb(0.12, 0.16, 0.25) }); x += widths[i]; }); page.drawLine({ start: { x: 34, y: y - 3 }, end: { x: 808, y: y - 3 }, thickness: 0.3, color: rgb(0.8, 0.82, 0.86) }); y -= 13; }); };
  start(); text(`Período: ${dateRange(report.period)}`, 9); text(`Vista monetaria: ${report.projectionMode === "CRC" ? "CRC" : "Original"}`, 9); activeFilters(filter).forEach((value) => text(value, 9)); text(`Generado: ${businessDateTime(report.generatedAt)}`, 9);
  heading("Resumen por moneda"); report.currencies.forEach((s: any) => { text(s.currencyCode, 9); table(tax ? ["Documentos", "Ventas exentas", "Ventas exoneradas", "Impuesto bruto", "Impuesto exonerado", "Impuesto cobrado"] : ["Documentos", "Ventas brutas", "Descuentos", "Ventas gravadas", "Ventas exentas", "Ventas exoneradas", "Impuesto bruto", "Imp. exonerado", "Imp. cobrado", "Total facturado"], tax ? [90, 125, 125, 120, 120, 120] : [60, 80, 70, 80, 75, 85, 75, 75, 75, 80], [tax ? [String(s.documentCount), money(s.exemptSales, s.currencyCode), money(s.exoneratedSales, s.currencyCode), money(s.grossTax, s.currencyCode), money(s.exoneratedTax, s.currencyCode), money(s.taxCollected, s.currencyCode)] : [String(s.documentCount), money(s.grossSales, s.currencyCode), money(s.discounts, s.currencyCode), money(s.taxableSales, s.currencyCode), money(s.exemptSales, s.currencyCode), money(s.exoneratedSales, s.currencyCode), money(s.grossTax, s.currencyCode), money(s.exoneratedTax, s.currencyCode), money(s.taxCollected, s.currencyCode), money(s.total, s.currencyCode)]]); });
  if (tax) { heading("Impuestos por tarifa"); table(["Tarifa", "Código", "Base imponible", "Impuesto bruto", "Exoneración", "Impuesto cobrado", "Documentos"], [75, 80, 130, 130, 110, 130, 80], report.currencies.flatMap((s: any) => s.taxGroups.map((g: any) => [`${g.rate}%`, `${g.taxCode}${g.rateCode ? ` · ${g.rateCode}` : ""}`, money(g.taxableBase, s.currencyCode), money(g.grossTaxAmount, s.currencyCode), g.exemptionAmount === undefined ? "—" : money(g.exemptionAmount, s.currencyCode), money(g.taxCollected, s.currencyCode), String(g.documentCount)]))); }
  heading("Detalle de documentos"); table(tax ? ["Fecha", "Documento", "Cliente", "Moneda", "Gravadas", "Exentas", "Exoneradas", "Impuesto", "Total", "Efecto"] : ["Fecha", "Documento", "Cliente", "Moneda", "Gravadas", "Impuesto", "Total", "Efecto"], tax ? [55, 72, 120, 45, 75, 70, 75, 70, 75, 60] : [60, 80, 170, 55, 105, 95, 105, 80], report.documents.map((d: any) => tax ? [date(d.issuedOn), d.documentNumber, d.customer?.name ?? "—", d.currencyCode, money(d.taxableSales, d.currencyCode), money(d.exemptSales, d.currencyCode), money(d.exoneratedSales, d.currencyCode), money(d.taxCollected, d.currencyCode), money(d.total, d.currencyCode), effect(d.effect)] : [date(d.issuedOn), d.documentNumber, d.customer?.name ?? "—", d.currencyCode, money(d.taxableSales, d.currencyCode), money(d.taxCollected, d.currencyCode), money(d.total, d.currencyCode), effect(d.effect)]));
  if (report.projectionMode === "CRC") { heading("Auditoría de proyección"); report.documents.forEach((d: any) => text(`${d.documentNumber}: ${d.originalCurrencyCode} · TC fiscal ${d.projection?.rate ?? "1"} · ${d.projection?.rateAuthority ?? "IDENTITY"} · ${date(d.projection?.effectiveOn)}`)); }
  pages.forEach((p, index) => p.drawText(`Reporte generado por el sistema · Página ${index + 1} de ${pages.length}`, { x: 34, y: 22, size: 8, font, color: rgb(0.35, 0.4, 0.48) }));
  return Buffer.from(await pdf.save());
}

function fit(value: unknown, width: number, font: any, size: number) { const text = String(value ?? ""); const max = width - 6; return font.widthOfTextAtSize(text, size) <= max ? text : `${text.slice(0, Math.max(1, Math.floor(text.length * max / font.widthOfTextAtSize(text, size)) - 1))}…`; }
function money(value: string, currency: string) { const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value)); if (!match) return `${currency} ${value}`; const fraction = (match[3] ?? "").padEnd(3, "0"); let cents = `${match[2]}${fraction.slice(0, 2)}`; if (fraction[2] >= "5") cents = (BigInt(cents) + 1n).toString(); const whole = cents.length > 2 ? cents.slice(0, -2) : "0"; return `${currency} ${match[1]}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents.slice(-2).padStart(2, "0")}`; }
function date(value: string | undefined) { if (!value) return "—"; const [year, month, day] = value.slice(0, 10).split("-"); return year && month && day ? `${day}/${month}/${year}` : value; }
function dateRange(period: { startOn: string; endOn: string }) { return `${date(period.startOn)} – ${date(period.endOn)}`; }
function businessDateTime(value: string) { return `${new Intl.DateTimeFormat("es-CR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(new Date(value))} UTC`; }
function effect(value: string) { return value === "DECREASE" ? "Disminuye ventas" : "Aumenta ventas"; }
function activeFilters(filter?: object) { const labels: Record<string, string> = { saleCondition: "Condición de venta", currencyCode: "Moneda origen", taxCode: "Código impuesto", rateCode: "Código tarifa", rate: "Tarifa" }; return Object.entries(filter ?? {}).filter(([, value]) => value && value !== "ALL").map(([key, value]) => `${labels[key] ?? key}: ${value === "CREDIT" ? "Crédito" : value === "CASH" ? "Contado" : value}`); }

async function renderXlsx(report: any, tax: boolean): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook(); const summary = workbook.addWorksheet("Resumen"); summary.addRows(metadata(report));
  summary.addRow([]); const summaryHeader = tax ? ["Moneda", "Documentos", "Ventas exentas", "Ventas exoneradas", "Impuesto bruto", "Impuesto exonerado", "Impuesto cobrado"] : ["Moneda", "Documentos", "Ventas brutas", "Descuentos", "Ventas gravadas", "Ventas exentas", "Ventas exoneradas", "Impuesto bruto", "Impuesto exonerado", "Impuesto cobrado", "Total facturado"]; summary.addRow(summaryHeader);
  report.currencies.forEach((x: any) => summary.addRow(tax ? [x.currencyCode, x.documentCount, x.exemptSales, x.exoneratedSales, x.grossTax, x.exoneratedTax, x.taxCollected] : [x.currencyCode, x.documentCount, x.grossSales, x.discounts, x.taxableSales, x.exemptSales, x.exoneratedSales, x.grossTax, x.exoneratedTax, x.taxCollected, x.total])); formatSheet(summary, summaryHeader.length, metadata(report).length + 2);
  if (tax) { const rates = workbook.addWorksheet("Impuestos por tarifa"); const header = ["Moneda", "Código impuesto", "Código tarifa", "Tarifa %", "Base imponible", "Impuesto bruto", "Exoneración", "Impuesto cobrado", "Documentos"]; rates.addRow(header); report.currencies.forEach((x: any) => x.taxGroups.forEach((g: any) => rates.addRow([x.currencyCode, g.taxCode, g.rateCode ?? "", g.rate, g.taxableBase, g.grossTaxAmount, g.exemptionAmount ?? "", g.taxCollected, g.documentCount]))); formatSheet(rates, header.length, 1); }
  const documents = workbook.addWorksheet("Documentos"); const header = tax ? ["Fecha", "Documento", "Cliente", "Identificación", "Efecto", "Moneda original", "Ventas gravadas", "Ventas exentas", "Ventas exoneradas", "Impuesto bruto", "Impuesto exonerado", "Impuesto cobrado", "Total original", "Moneda presentación", "Total presentado", "Tasa fiscal", "Fecha tasa", "Autoridad tasa"] : ["Fecha", "Documento", "Cliente", "Identificación", "Efecto", "Moneda original", "Ventas brutas", "Descuentos", "Ventas gravadas", "Ventas exentas", "Ventas exoneradas", "Impuesto bruto", "Impuesto exonerado", "Impuesto cobrado", "Total original", "Moneda presentación", "Total presentado", "Tasa fiscal", "Fecha tasa", "Autoridad tasa"]; documents.addRow(header);
  report.documents.forEach((d: any) => { const o = d.originalAmounts ?? {}; documents.addRow(tax ? [d.issuedOn, d.documentNumber, d.customer?.name ?? "", d.customer?.identification ?? "", d.effect ?? "", d.originalCurrencyCode, d.taxableSales, d.exemptSales, d.exoneratedSales, d.grossTax, d.exoneratedTax, d.taxCollected, o.total ?? d.total, d.currencyCode, d.total, d.projection?.rate ?? "1", d.projection?.effectiveOn ?? "", d.projection?.rateAuthority ?? "IDENTITY"] : [d.issuedOn, d.documentNumber, d.customer?.name ?? "", d.customer?.identification ?? "", d.effect ?? "", d.originalCurrencyCode, d.grossSales, d.discounts, d.taxableSales, d.exemptSales, d.exoneratedSales, d.grossTax, d.exoneratedTax, d.taxCollected, o.total ?? d.total, d.currencyCode, d.total, d.projection?.rate ?? "1", d.projection?.effectiveOn ?? "", d.projection?.rateAuthority ?? "IDENTITY"]); }); formatSheet(documents, header.length, 1);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function formatSheet(sheet: ExcelJS.Worksheet, columnCount: number, headerRow: number) { const row = sheet.getRow(headerRow); row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E4F8A" } }; sheet.views = [{ state: "frozen", ySplit: headerRow }]; sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: Math.max(headerRow, sheet.rowCount), column: columnCount } }; for (let i = 1; i <= columnCount; i += 1) sheet.getColumn(i).width = i <= 2 ? 16 : 22; }

function renderCsv(report: any, tax: boolean): string {
  const salesHeader = ["Fecha", "Documento", "Cliente", "Identificación", "Efecto", "Moneda original", "Ventas brutas", "Descuentos", "Ventas gravadas", "Ventas exentas", "Ventas exoneradas", "Impuesto bruto", "Impuesto exonerado", "Impuesto cobrado", "Total original", "Moneda presentación", "Total presentado", "Tasa fiscal", "Fecha tasa", "Autoridad tasa"];
  const taxHeader = [...salesHeader, "Código impuesto", "Código tarifa", "Tarifa %", "Base imponible tarifa", "Impuesto bruto tarifa", "Exoneración tarifa", "Impuesto cobrado tarifa"];
  const rows: string[][] = [["Reporte", report.reportKey], ["Periodo", `${report.period.startOn} a ${report.period.endOn}`], ["Vista monetaria", report.projectionMode], [], tax ? taxHeader : salesHeader];
  report.documents.forEach((d: any) => { const o = d.originalAmounts ?? {}; const core = [d.issuedOn, d.documentNumber, d.customer?.name ?? "", d.customer?.identification ?? "", d.effect ?? "", d.originalCurrencyCode, tax ? d.taxableSales : d.grossSales, tax ? "" : d.discounts, d.taxableSales, d.exemptSales, d.exoneratedSales, d.grossTax, d.exoneratedTax, d.taxCollected, o.total ?? d.total, d.currencyCode, d.total, d.projection?.rate ?? "1", d.projection?.effectiveOn ?? "", d.projection?.rateAuthority ?? "IDENTITY"]; if (!tax) rows.push(core); else (d.taxes.length ? d.taxes : [{}]).forEach((t: any) => rows.push([...core, t.taxCode ?? "", t.rateCode ?? "", t.rate ?? "", t.taxableBase ?? "", t.grossTaxAmount ?? "", t.exemptionAmount ?? "", t.taxCollected ?? ""])); });
  return rows.map((row) => row.map(csv).join(",")).join("\r\n");
}
function csv(value: unknown): string { const text = String(value ?? ""); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function periodName(period: { startOn: string; endOn: string }): string { return period.startOn === period.endOn ? period.startOn : `${period.startOn}-a-${period.endOn}`; }

async function renderReceivables(report: any, request: AuthenticatedReceivablesReportRequest, format: ReportingExportFormat): Promise<ReportingExport> {
  const fileName = `cuentas-por-cobrar-${request.dueDate.preset.toLowerCase()}.${format.toLowerCase()}`;
  if (format === "PDF") return { bytes: await renderReceivablesPdf(report, request), mimeType: "application/pdf", fileName };
  if (format === "XLSX") return { bytes: await renderReceivablesXlsx(report, request), mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName };
  return { bytes: Buffer.from(`\ufeff${renderReceivablesCsv(report, request)}`, "utf8"), mimeType: "text/csv; charset=utf-8", fileName };
}

function receivablesMetadata(report: any, request: AuthenticatedReceivablesReportRequest): string[][] {
  return [
    ["Reporte", "Cuentas por cobrar"],
    ["Vencimiento", dueDateLabel(request.dueDate)],
    ["Moneda", request.filter?.currencyCode ?? "Todas"],
    ["Tipo", categoryLabel(request.filter?.category)],
    ["Estado", timingLabel(request.filter?.timing)],
    ["Generado", businessDateTime(report.generatedAt)],
  ];
}

async function renderReceivablesPdf(report: any, request: AuthenticatedReceivablesReportRequest): Promise<Buffer> {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold); const pages: any[] = []; let page: any; let y = 0;
  const start = () => { page = pdf.addPage([842, 595]); pages.push(page); y = 530; page.drawRectangle({ x: 0, y: 545, width: 842, height: 50, color: rgb(0.08, 0.28, 0.55) }); page.drawText("Cuentas por cobrar", { x: 34, y: 565, size: 17, font: bold, color: rgb(1, 1, 1) }); };
  const ensure = (height: number) => { if (y - height < 45) start(); };
  const heading = (text: string) => { ensure(22); page.drawText(text, { x: 34, y, size: 11, font: bold, color: rgb(0.08, 0.28, 0.55) }); y -= 18; };
  const text = (value: string, size = 8) => { ensure(13); page.drawText(value.slice(0, 180), { x: 34, y, size, font, color: rgb(0.12, 0.16, 0.25) }); y -= 12; };
  const table = (headers: string[], widths: number[], rows: string[][]) => { const drawHeader = () => { if (y < 75) start(); let x = 34; headers.forEach((header, index) => { page.drawRectangle({ x, y: y - 3, width: widths[index], height: 15, color: rgb(0.08, 0.28, 0.55) }); page.drawText(header, { x: x + 3, y: y + 1, size: 6.5, font: bold, color: rgb(1, 1, 1) }); x += widths[index]; }); y -= 18; }; drawHeader(); rows.forEach((row) => { if (y < 58) { start(); drawHeader(); } let x = 34; row.forEach((value, index) => { page.drawText(fit(value, widths[index], font, 6.7), { x: x + 3, y, size: 6.7, font, color: rgb(0.12, 0.16, 0.25) }); x += widths[index]; }); page.drawLine({ start: { x: 34, y: y - 3 }, end: { x: 808, y: y - 3 }, thickness: 0.3, color: rgb(0.8, 0.82, 0.86) }); y -= 13; }); };
  start(); receivablesMetadata(report, request).forEach(([label, value]) => text(`${label}: ${value}`, 9));
  heading("Resumen por moneda"); report.currencies.forEach((summary: any) => { text(summary.currencyCode, 9); table(["CxC pendiente", "Obligación pendiente", "CxC vencida", "Obligación vencida", "CxC sin fecha", "Obligación sin fecha"], [120, 130, 120, 130, 120, 130], [[money(summary.recognizedOutstanding, summary.currencyCode), money(summary.projectedOutstanding, summary.currencyCode), money(summary.overdueRecognized, summary.currencyCode), money(summary.overdueProjected, summary.currencyCode), money(summary.noDateRecognized, summary.currencyCode), money(summary.noDateProjected, summary.currencyCode)]]); });
  heading("Detalle de cuentas por cobrar"); table(["Fecha", "Tipo", "Referencia", "Vencimiento", "Moneda", "Original", "Aplicado", "Pendiente", "Estado"], [62, 95, 92, 72, 46, 88, 82, 88, 72], report.rows.map((row: any) => [date(row.createdOn), categoryLabel(row.category), row.reference ?? "—", date(row.dueOn), row.currencyCode, money(row.originalAmount, row.currencyCode), money(row.appliedAmount, row.currencyCode), money(row.outstandingAmount, row.currencyCode), timingLabel(row.collectionTiming)]));
  pages.forEach((item, index) => item.drawText(`Reporte generado por el sistema · Página ${index + 1} de ${pages.length}`, { x: 34, y: 22, size: 8, font, color: rgb(0.35, 0.4, 0.48) }));
  return Buffer.from(await pdf.save());
}

async function renderReceivablesXlsx(report: any, request: AuthenticatedReceivablesReportRequest): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook(); const summary = workbook.addWorksheet("Resumen"); const metadataRows = receivablesMetadata(report, request); summary.addRows(metadataRows); summary.addRow([]);
  const summaryHeader = ["Moneda", "CxC facturada pendiente", "Obligación contractual pendiente", "CxC facturada vencida", "Obligación contractual vencida", "CxC facturada sin fecha", "Obligación contractual sin fecha"]; summary.addRow(summaryHeader); report.currencies.forEach((item: any) => summary.addRow([item.currencyCode, item.recognizedOutstanding, item.projectedOutstanding, item.overdueRecognized, item.overdueProjected, item.noDateRecognized, item.noDateProjected])); formatSheet(summary, summaryHeader.length, metadataRows.length + 2);
  const detail = workbook.addWorksheet("Cuentas por cobrar"); const detailHeader = ["Fecha", "Tipo", "Referencia", "Vencimiento", "Moneda", "Monto original", "Aplicado", "Pendiente", "Estado", "Estado financiero"]; detail.addRow(detailHeader); report.rows.forEach((row: any) => detail.addRow([row.createdOn, categoryLabel(row.category), row.reference ?? "", row.dueOn ?? "", row.currencyCode, row.originalAmount, row.appliedAmount, row.outstandingAmount, timingLabel(row.collectionTiming), statusLabel(row.status)])); formatSheet(detail, detailHeader.length, 1);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function renderReceivablesCsv(report: any, request: AuthenticatedReceivablesReportRequest): string {
  const header = ["Fecha", "Tipo", "Referencia", "Vencimiento", "Moneda", "Monto original", "Aplicado", "Pendiente", "Estado", "Estado financiero"];
  const rows: string[][] = [["Reporte", "Cuentas por cobrar"], ["Vencimiento", dueDateLabel(request.dueDate)], ["Moneda", request.filter?.currencyCode ?? "Todas"], ["Tipo", categoryLabel(request.filter?.category)], ["Estado", timingLabel(request.filter?.timing)], [], header];
  report.rows.forEach((row: any) => rows.push([row.createdOn, categoryLabel(row.category), row.reference ?? "", row.dueOn ?? "", row.currencyCode, row.originalAmount, row.appliedAmount, row.outstandingAmount, timingLabel(row.collectionTiming), statusLabel(row.status)]));
  return rows.map((row) => row.map(csv).join(",")).join("\r\n");
}

function dueDateLabel(selection: AuthenticatedReceivablesReportRequest["dueDate"]): string {
  if (selection.preset === "CUSTOM") return `Personalizado: ${selection.dateFrom} a ${selection.dateTo}`;
  return ({ ALL: "Todas las fechas", OVERDUE: "Vencidas", DUE_TODAY: "Vence hoy", NEXT_7_DAYS: "Próximos 7 días", NEXT_15_DAYS: "Próximos 15 días", CURRENT_MONTH: "Mes actual" } as const)[selection.preset];
}
function categoryLabel(value: string | undefined): string { return value === "RECOGNIZED_RECEIVABLE" ? "CxC facturada" : value === "PROJECTED_RECEIVABLE" ? "Obligación contractual" : "Todas"; }
function timingLabel(value: string | undefined): string { return value === "OVERDUE" ? "Vencido" : value === "CURRENT" ? "Vigente" : value === "FUTURE" ? "Futuro" : value === "NO_PROJECTABLE_DATE" ? "Sin fecha proyectable" : "Todos"; }
function statusLabel(value: string): string { return value === "PARTIALLY_SETTLED" ? "Parcialmente cobrada" : "Pendiente"; }
