import * as ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as sharp from "sharp";
import type { AccountingCostRow } from "../accounting-costs/accounting-costs.types";
import type { ReportingExport, ReportingExportFormat } from "./reporting-export.service";

export type AccountingCostsExportProjection = "ORIGINAL" | "BASE";
export type AccountingCostsPdfBranding = {
  name?: string | null;
  legalName?: string | null;
  logoUrl?: string | null;
  emailLogoUrl?: string | null;
};

const headers = ["Fecha", "Fuente", "Contexto", "Descripción", "Proveedor", "Subtotal", "Impuesto", "Total", "Moneda", "TC / autoridad", "Total moneda contable", "Factura proveedor", "Referencia", "Estado"];
const PDF_TEXT_REPLACEMENTS: Readonly<Record<string, string>> = {
  "\u00a0": " ",
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
  "\u2190": "<-",
  "\u2192": "->",
};
const WIN_ANSI_CODE_POINTS = new Set([
  ...Array.from({ length: 0x7f - 0x20 }, (_, index) => index + 0x20),
  ...Array.from({ length: 0x100 - 0xa0 }, (_, index) => index + 0xa0),
  0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192, 0x02c6, 0x02dc,
  0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020, 0x2021, 0x2022, 0x2030,
  0x2039, 0x203a, 0x20ac, 0x2122,
]);

/** Keeps standard-font PDF rendering safe without changing XLSX/CSV source values. */
export function normalizePdfText(value: unknown): string {
  return Array.from(String(value ?? "").normalize("NFC"), (character) => {
    const replacement = PDF_TEXT_REPLACEMENTS[character];
    if (replacement !== undefined) return replacement;
    return WIN_ANSI_CODE_POINTS.has(character.codePointAt(0)!) ? character : "?";
  }).join("");
}

/** Presentation-only renderer over the Accounting Costs report; it never performs FX work. */
export async function renderAccountingCostsExport(report: any, projectionMode: AccountingCostsExportProjection, format: ReportingExportFormat, branding?: AccountingCostsPdfBranding): Promise<ReportingExport> {
  const fileName = `costos-reales-operaciones-${periodName(report.period)}.${format.toLowerCase()}`;
  if (format === "PDF") return { bytes: await pdf(report, projectionMode, branding), mimeType: "application/pdf", fileName };
  if (format === "XLSX") return { bytes: await xlsx(report, projectionMode), mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName };
  return { bytes: Buffer.from(`\ufeff${csvReport(report, projectionMode)}`, "utf8"), mimeType: "text/csv; charset=utf-8", fileName };
}

function metadata(report: any, projectionMode: AccountingCostsExportProjection): string[][] {
  return [
    ["Reporte", "Costos reales · Operaciones"], ["Período", `${report.period.startOn} a ${report.period.endOn}`], ["Vista monetaria", projectionMode === "BASE" ? `Base (${report.accountingCurrencyCode ?? "no configurada"})` : "Original"],
    ["Generado", dateTime(report.generatedAt, report.timezone)],
  ];
}

function detail(row: AccountingCostRow, projectionMode: AccountingCostsExportProjection, timezone: string): string[] {
  const conversionAvailable = row.conversion.status === "IDENTITY" || row.conversion.status === "AVAILABLE";
  const base = projectionMode === "BASE" && conversionAvailable;
  const currency = base ? row.conversion.baseCurrency : row.currency;
  const subtotal = base ? row.conversion.subtotal! : row.subtotal;
  const tax = base ? row.conversion.tax! : row.tax;
  const total = base ? row.conversion.total! : row.total;
  const rate = conversionAvailable ? `${row.conversion.exchangeRate ?? "1"} · ${row.conversion.authority ?? "IDENTITY"}` : unavailable(row.conversion.status);
  const accountingTotal = conversionAvailable ? `${row.conversion.baseCurrency} ${row.conversion.total}` : unavailable(row.conversion.status);
  return [dateTime(row.sourceDate, timezone), source(row), context(row), row.description, row.counterparty.name, subtotal, tax, total, currency, rate, accountingTotal, row.reference.documentNumber ?? "", row.reference.supplierReference ?? "", row.cancelled ? "Cancelado" : row.status];
}

function source(row: AccountingCostRow) { return row.sourceType === "OPERATIONAL_PURCHASE" ? "Compra operacional" : row.sourceType; }
function context(row: AccountingCostRow) {
  const value = row.context;
  if (value.sourceCategory === "BASE_TRIP") return [value.travelPackage?.code, value.travelPackage?.name, value.servicePurpose.name].filter(Boolean).join(" · ");
  if (value.sourceCategory === "ADDITIONAL_SERVICES") return [value.travelPackage?.code, value.travelPackage?.name, value.servicePurpose.name].filter(Boolean).join(" · ");
  if (value.sourceCategory === "CUSTOM_QUOTATION") return [value.customer?.name, value.quotation?.number ? `Cotización ${value.quotation.number}` : "", value.servicePurpose.name].filter(Boolean).join(" · ");
  return value.servicePurpose.name;
}
function unavailable(status: string) { return status === "FX_SNAPSHOT_INVALID" ? "Snapshot TC inválido" : "Conversión no disponible"; }
function dateTime(value: Date | string, timezone: string) { return new Intl.DateTimeFormat("es-CR", { timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)); }
function periodName(period: { startOn: string; endOn: string }) { return period.startOn === period.endOn ? period.startOn : `${period.startOn}-a-${period.endOn}`; }
function money(value: string, currency: string) { return `${currency} ${value}`; }

function summaryRows(report: any, projectionMode: AccountingCostsExportProjection): string[][] {
  if (projectionMode === "ORIGINAL") return report.summaries.byCurrency.map((value: any) => [value.currency, String(value.count), money(value.subtotal, value.currency), money(value.tax, value.currency), money(value.total, value.currency)]);
  const baseRows = report.summaries.baseByCurrency as Array<any>;
  const rows = baseRows.map((value) => [value.baseCurrency, String(value.countConverted), money(value.subtotal, value.baseCurrency), money(value.tax, value.baseCurrency), money(value.total, value.baseCurrency)]);
  if (report.summaries.base.isPartial) rows.push(["Conversión parcial", String(report.summaries.base.missingConversionCount), "", "", `${report.summaries.base.invalidSnapshotCount} snapshot(s) TC inválido(s)`]);
  return rows;
}

async function pdf(report: any, projectionMode: AccountingCostsExportProjection, branding?: AccountingCostsPdfBranding): Promise<Buffer> {
  const document = await PDFDocument.create(); const font = await document.embedFont(StandardFonts.Helvetica); const bold = await document.embedFont(StandardFonts.HelveticaBold); const pages: any[] = []; let page: any; let y = 0;
  const logo = await loadTenantLogo(document, branding);
  const tenantName = tenantDisplayName(branding);
  const start = () => { page = document.addPage([1224, 792]); pages.push(page); y = 726; page.drawRectangle({ x: 0, y: 742, width: 1224, height: 50, color: rgb(0.08, 0.28, 0.55) }); const textX = logo ? 116 : 28; if (logo) page.drawImage(logo.image, { x: 28, y: 748, width: logo.width, height: logo.height }); page.drawText(fit(tenantName, 360, bold, 9), { x: textX, y: 770, size: 9, font: bold, color: rgb(1, 1, 1) }); page.drawText(normalizePdfText("Costos reales · Operaciones"), { x: textX, y: 750, size: 14, font: bold, color: rgb(1, 1, 1) }); };
  const text = (value: string, size = 8) => { if (y < 45) start(); page.drawText(normalizePdfText(value).slice(0, 220), { x: 28, y, size, font, color: rgb(0.12, 0.16, 0.25) }); y -= 13; };
  const heading = (value: string) => { if (y < 60) start(); page.drawText(normalizePdfText(value), { x: 28, y, size: 11, font: bold, color: rgb(0.08, 0.28, 0.55) }); y -= 18; };
  const table = (tableHeaders: string[], widths: number[], rows: string[][]) => { const header = () => { if (y < 70) start(); let x = 28; tableHeaders.forEach((value, index) => { page.drawRectangle({ x, y: y - 3, width: widths[index], height: 15, color: rgb(0.08, 0.28, 0.55) }); page.drawText(fit(value, widths[index], bold, 6.5), { x: x + 3, y: y + 1, size: 6.5, font: bold, color: rgb(1, 1, 1) }); x += widths[index]; }); y -= 18; }; header(); rows.forEach((row) => { if (y < 55) { start(); header(); } let x = 28; row.forEach((value, index) => { page.drawText(fit(value, widths[index], font, 6.3), { x: x + 3, y, size: 6.3, font, color: rgb(0.12, 0.16, 0.25) }); x += widths[index]; }); y -= 13; }); };
  start(); metadata(report, projectionMode).forEach(([label, value]) => text(`${label}: ${value}`, 9)); heading(projectionMode === "ORIGINAL" ? "Resumen por moneda original" : "Resumen en moneda contable"); table(["Moneda", "Registros", "Subtotal", "Impuesto", "Total"], [130, 85, 160, 160, 160], summaryRows(report, projectionMode)); heading("Detalle de costos"); table(headers, [65, 75, 100, 90, 95, 63, 63, 63, 50, 85, 85, 85, 85, 64], report.rows.map((row: AccountingCostRow) => detail(row, projectionMode, report.timezone)));
  pages.forEach((current, index) => current.drawText(normalizePdfText(`Reporte generado por el sistema · Página ${index + 1} de ${pages.length}`), { x: 28, y: 20, size: 8, font, color: rgb(0.35, 0.4, 0.48) }));
  return Buffer.from(await document.save());
}

export function tenantDisplayName(branding?: AccountingCostsPdfBranding): string {
  return [branding?.name, branding?.legalName].map((value) => String(value ?? "").trim()).find(Boolean) ?? "Empresa";
}

async function loadTenantLogo(document: any, branding?: AccountingCostsPdfBranding) {
  const logoUrl = [branding?.emailLogoUrl, branding?.logoUrl].map((value) => String(value ?? "").trim()).find(Boolean);
  if (!logoUrl) return null;
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const isJpeg = contentType.includes("jpeg") || /\.jpe?g(?:$|[?#])/i.test(logoUrl);
    const image = isJpeg ? await document.embedJpg(bytes) : await document.embedPng(contentType.includes("png") || /\.png(?:$|[?#])/i.test(logoUrl) ? bytes : await sharp(bytes).png().toBuffer());
    const scale = Math.min(72 / image.width, 38 / image.height, 1);
    return { image, width: image.width * scale, height: image.height * scale };
  } catch {
    return null;
  }
}

async function xlsx(report: any, projectionMode: AccountingCostsExportProjection): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook(); const summary = workbook.addWorksheet("Resumen"); summary.addRows(metadata(report, projectionMode)); summary.addRow([]); const summaryHeader = ["Moneda", "Registros", "Subtotal", "Impuesto", "Total"]; summary.addRow(summaryHeader); summaryRows(report, projectionMode).forEach((row) => summary.addRow(row)); format(summary, summaryHeader.length, metadata(report, projectionMode).length + 2);
  const operations = workbook.addWorksheet("Operaciones"); operations.addRow(headers); report.rows.forEach((row: AccountingCostRow) => operations.addRow(detail(row, projectionMode, report.timezone))); format(operations, headers.length, 1);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function csvReport(report: any, projectionMode: AccountingCostsExportProjection) {
  const rows: string[][] = [...metadata(report, projectionMode), [], [projectionMode === "ORIGINAL" ? "Resumen por moneda original" : "Resumen en moneda contable"], ["Moneda", "Registros", "Subtotal", "Impuesto", "Total"], ...summaryRows(report, projectionMode), [], headers, ...report.rows.map((row: AccountingCostRow) => detail(row, projectionMode, report.timezone))];
  return rows.map((row) => row.map(csv).join(",")).join("\r\n");
}
function format(sheet: ExcelJS.Worksheet, columns: number, headerRow: number) { const row = sheet.getRow(headerRow); row.font = { bold: true, color: { argb: "FFFFFFFF" } }; row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E4F8A" } }; sheet.views = [{ state: "frozen", ySplit: headerRow }]; sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: Math.max(headerRow, sheet.rowCount), column: columns } }; for (let index = 1; index <= columns; index += 1) sheet.getColumn(index).width = index <= 2 ? 18 : 24; }
function fit(value: string, width: number, font: any, size: number) { const text = normalizePdfText(value); const maximum = width - 6; return font.widthOfTextAtSize(text, size) <= maximum ? text : `${text.slice(0, Math.max(1, Math.floor(text.length * maximum / font.widthOfTextAtSize(text, size)) - 1))}...`; }
function csv(value: unknown) { const text = String(value ?? ""); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
