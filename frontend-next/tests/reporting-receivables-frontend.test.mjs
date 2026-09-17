import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registry = readFileSync(new URL("../src/features/reporting/report-registry.ts", import.meta.url), "utf8");
const guard = readFileSync(new URL("../src/features/reporting/report-route-guard.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/reports/receivables/page.tsx", import.meta.url), "utf8");
const reportingApi = readFileSync(new URL("../src/lib/reporting-api.ts", import.meta.url), "utf8");

test("Cuentas por cobrar is an enabled report card for ADMIN and CONTADOR only", () => {
  assert.match(registry, /key: "RECEIVABLES"[\s\S]*?title: "Cuentas por cobrar"[\s\S]*?href: "\/reports\/receivables"[\s\S]*?available: true[\s\S]*?allowedRoles: \["ADMIN", "CONTADOR"\]/);
  assert.doesNotMatch(registry, /RECEIVABLES[\s\S]*?"FACTURACION_COBROS"|RECEIVABLES[\s\S]*?"OPERACIONES"|RECEIVABLES[\s\S]*?"AGENT"/);
  assert.match(page, /<ReportRouteGuard reportKey="RECEIVABLES">/);
  assert.match(guard, /canAccessReport\(role, reportKey\)/);
});

test("Receivables calls its Reporting endpoint with the accounting filters and pagination", () => {
  assert.match(reportingApi, /fetchApi\("\/reporting\/receivables"/);
  assert.match(page, /getReceivablesReport\(\{[\s\S]*?pageSize: PAGE_SIZE/);
  assert.match(page, /const PAGE_SIZE = 25/);
  assert.match(page, /currencyCode: currencyCode === "ALL" \? undefined : currencyCode/);
  assert.match(page, /category: category === "ALL" \? undefined : category/);
  assert.match(page, /timing: timing === "ALL" \? undefined : timing/);
  assert.match(page, /resetPage\(\(\) => setCurrencyCode/);
  assert.match(page, /resetPage\(\(\) => setCategory/);
  assert.match(page, /resetPage\(\(\) => setTiming/);
});

test("Receivables exports the active server-side portfolio filters through the Reporting export route", () => {
  assert.match(reportingApi, /"RECEIVABLES"/);
  assert.match(reportingApi, /"\/reporting\/receivables\/export"/);
  assert.match(page, /downloadReportingExport\("RECEIVABLES", format,/);
  assert.match(page, /dueDatePreset,/);
  assert.match(page, /currencyCode: currencyCode === "ALL" \? undefined : currencyCode/);
  assert.match(page, /category: category === "ALL" \? undefined : category/);
  assert.match(page, /timing: timing === "ALL" \? undefined : timing/);
  assert.match(page, /<DropdownMenuItem onSelect=\{\(\) => void exportReport\("PDF"\)\}>PDF<\/DropdownMenuItem>/);
  assert.match(page, /exportReport\("XLSX"\)/);
  assert.match(page, /exportReport\("CSV"\)/);
});

test("Receivables defaults to the complete portfolio and supports due-date filters", () => {
  for (const preset of ["ALL", "OVERDUE", "DUE_TODAY", "NEXT_7_DAYS", "NEXT_15_DAYS", "CURRENT_MONTH", "CUSTOM"]) {
    assert.match(page, new RegExp(`value: "${preset}"`));
  }
  assert.match(page, /useState<ReceivablesDueDatePreset>\("ALL"\)/);
  assert.match(page, /dueDatePreset,/);
  assert.match(page, /dueDatePreset === "CUSTOM"/);
  assert.doesNotMatch(page, /periodPreset/);
  assert.match(page, />Desde</);
  assert.match(page, />Hasta</);
  assert.match(page, /type="date"/);
});

test("Receivables removes the customer filter and uses business category and timing labels", () => {
  assert.doesNotMatch(page, /customerSearch/);
  assert.match(page, /RECOGNIZED_RECEIVABLE" \? "CxC facturada" : "Obligación contractual"/);
  assert.match(page, /<option value="RECOGNIZED_RECEIVABLE">CxC facturada<\/option>/);
  assert.match(page, /<option value="PROJECTED_RECEIVABLE">Obligación contractual<\/option>/);
  assert.match(page, /case "OVERDUE": return "Vencido"/);
  assert.match(page, /case "CURRENT": return "Vigente"/);
  assert.match(page, /case "FUTURE": return "Futuro"/);
  assert.match(page, /case "NO_PROJECTABLE_DATE": return "Sin fecha proyectable"/);
  assert.match(page, /<Badge variant=\{timingVariant\(row\.collectionTiming\)\}>\{timingLabel\(row\.collectionTiming\)\}<\/Badge>/);
});

test("Receivables keeps currency summaries and categories distinct", () => {
  assert.match(page, /result\.currencies\.map\(\(summary\) => <CurrencySummaryCard/);
  for (const label of ["CxC facturada pendiente", "Obligación contractual pendiente", "CxC facturada vencida", "Obligación contractual vencida", "CxC facturada sin fecha", "Obligación contractual sin fecha"]) {
    assert.match(page, new RegExp(`label="${label}"`));
  }
  assert.match(page, /formatFinanceMoneyDisplay\(value, currencyCode\)/);
  assert.match(page, /result\?\.currencies\.map\(\(summary\) => summary\.currencyCode\)/);
  assert.doesNotMatch(page, /\["CRC", "USD"/);
  assert.doesNotMatch(page, /convertCurrency|exchangeRate|projectionMode|Vista monetaria/);
});

test("Receivables exposes no monthly installment projection without schedule authority", () => {
  assert.doesNotMatch(page, /monthlyProjection|Proyección mensual de cobros|Horizonte de proyección/);
  assert.doesNotMatch(reportingApi, /projectionHorizonMonths|monthlyProjection/);
});

test("Receivables preserves no-date rows and renders one mixed detail table in backend order", () => {
  assert.match(page, /row\.dueOn \? formatFiscalDate\(row\.dueOn\) : "Sin fecha proyectable"/);
  assert.match(page, /<CardTitle>Detalle de cuentas por cobrar<\/CardTitle>/);
  assert.match(page, /result\.rows\.map\(\(row\) => <TableRow/);
  for (const column of ["Cliente / identificación", "Tipo", "Referencia", "Fecha", "Vencimiento", "Moneda", "Monto original", "Aplicado", "Pendiente", "Estado"]) {
    assert.match(page, new RegExp(`>${column}<`));
  }
  assert.doesNotMatch(page, /result\.rows\.sort|result\.rows\.filter|\.reduce\(/);
});

test("Receivables uses server-side paging and reporting loading, empty, and error states", () => {
  assert.match(page, /setPage\(\(current\) => Math\.max\(1, current - 1\)\)/);
  assert.match(page, /setPage\(\(current\) => Math\.min\(result\.pagination\.totalPages, current \+ 1\)\)/);
  assert.match(page, /Cargando cuentas por cobrar/);
  assert.match(page, /No hay cuentas por cobrar u obligaciones contractuales para los filtros seleccionados\./);
  assert.match(page, /No se pudo cargar el reporte/);
  assert.match(page, /<Link href="\/reports">Volver a reportes<\/Link>/);
  assert.match(page, />Actualizar</);
});

test("Receivables remains readonly Reporting UI without operational or financial client logic", () => {
  assert.doesNotMatch(page, /AccountReceivable|CommercialObligation|BillingInvoice|Contract|TravelPackage|Reservation/);
  assert.doesNotMatch(page, /outstandingAmount\s*[+\-*/]|recognizedAmount\s*[+\-*/]|projectedAmount\s*[+\-*/]/);
  assert.doesNotMatch(reportingApi, /\/billing\/admin\/reports/);
});
