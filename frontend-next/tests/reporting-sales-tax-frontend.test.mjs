import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const registry = readFileSync(new URL('../src/features/reporting/report-registry.ts', import.meta.url), 'utf8');
const guard = readFileSync(new URL('../src/features/reporting/report-route-guard.tsx', import.meta.url), 'utf8');
const salesTaxPage = readFileSync(new URL('../src/app/reports/sales-tax/page.tsx', import.meta.url), 'utf8');
const reportingApi = readFileSync(new URL('../src/lib/reporting-api.ts', import.meta.url), 'utf8');

test('Sales Tax report card is enabled through the report registry for ADMIN and CONTADOR only', () => {
  assert.match(registry, /key: "SALES_TAX"[\s\S]*?href: "\/reports\/sales-tax"[\s\S]*?available: true[\s\S]*?allowedRoles: \["ADMIN", "CONTADOR"\]/);
  assert.doesNotMatch(registry, /"FACTURACION_COBROS"|"OPERACIONES"|"AGENT"/);
  assert.match(salesTaxPage, /<ReportRouteGuard reportKey="SALES_TAX">/);
  assert.match(guard, /canAccessReport\(role, reportKey\)/);
});

test('Sales Tax UI calls only the independent Reporting endpoint and supports all report periods', () => {
  assert.match(reportingApi, /fetchApi\("\/reporting\/sales-tax"/);
  assert.doesNotMatch(reportingApi, /\/billing\/admin\/reports|BillingInvoice|BillingPayment|BillingCreditNote/);
  for (const period of ['TODAY', 'LAST_7_DAYS', 'LAST_15_DAYS', 'CURRENT_MONTH', 'PREVIOUS_MONTH', 'CUSTOM']) {
    assert.match(salesTaxPage, new RegExp(`value: "${period}"`));
  }
  assert.match(salesTaxPage, /periodPreset === "CUSTOM"/);
  assert.match(salesTaxPage, /type="date"/);
  assert.match(salesTaxPage, /El período se resuelve con la zona horaria fiscal del tenant/);
});

test('Sales Tax UI renders currency summaries as a responsive, data-driven card grid', () => {
  assert.match(salesTaxPage, /<section className="grid gap-4 lg:grid-cols-2" aria-label="Resumen de impuestos por moneda">/);
  assert.match(salesTaxPage, /result\.currencies\.map\(\(summary\) => <TaxCurrencyCard/);
  assert.doesNotMatch(salesTaxPage, /currencyCode === "CRC"|currencyCode === "USD"/);
  assert.match(salesTaxPage, /<dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">/);
  for (const label of ['Ventas exentas', 'Ventas exoneradas', 'Impuesto bruto', 'Impuesto exonerado', 'Impuesto cobrado']) {
    assert.match(salesTaxPage, new RegExp(`label="${label}"`));
  }
  for (const column of ['Tarifa', 'Base imponible', 'Impuesto cobrado', 'Documentos']) {
    assert.match(salesTaxPage, new RegExp(`>${column}<`));
  }
  assert.match(salesTaxPage, /<div>\{group\.rate\}%<\/div>/);
  assert.match(salesTaxPage, /Código \{group\.taxCode\}/);
  assert.match(salesTaxPage, /Bruto: \{formatFinanceMoneyDisplay\(group\.grossTaxAmount/);
  assert.match(salesTaxPage, /group\.exemptionAmount === undefined \? ""/);
  assert.match(salesTaxPage, /summary\.taxGroups\.map\(\(group\) => <TableRow/);
  assert.doesNotMatch(salesTaxPage, /min-w-\[820px\]/);
  assert.doesNotMatch(salesTaxPage, /convertCurrency|exchangeRate|Hacienda|Contract|TravelPackage|Reservation|exemptBase|exoneratedBase/);
});

test('Sales Tax detail is generic, paginated, and renders readable effects', () => {
  assert.match(salesTaxPage, /const PAGE_SIZE = 25/);
  assert.match(salesTaxPage, /getSalesTaxReport\(\{ periodPreset,[\s\S]*?pageSize: PAGE_SIZE/);
  assert.match(salesTaxPage, /setPage\(\(current\) => Math\.max\(1, current - 1\)\)/);
  assert.match(salesTaxPage, /effect === "INCREASE" \? "Aumenta" : "Disminuye"/);
  assert.match(salesTaxPage, /Ventas gravadas/);
  assert.match(salesTaxPage, />Exentas</);
  assert.match(salesTaxPage, />Exoneradas</);
});

test('Sales Tax UI distinguishes loading, empty, and API-error states', () => {
  assert.match(salesTaxPage, /Cargando reporte de impuestos/);
  assert.match(salesTaxPage, /No hay documentos fiscales aceptados con impuestos para el período seleccionado\./);
  assert.match(salesTaxPage, /No se pudo cargar el reporte/);
  assert.match(reportingApi, /ReportingApiError/);
});

test('Sales Tax report header has a clear return action to the Reports workspace', () => {
  assert.match(salesTaxPage, /<Link href="\/reports">Volver a reportes<\/Link>/);
  assert.match(salesTaxPage, />Actualizar</);
});

test('Sales Tax filters currency and backend-provided tax groups server-side without fake per-rate bases', () => {
  assert.match(salesTaxPage, /Tarifa \/ impuesto/);
  assert.match(salesTaxPage, /taxGroupOptions = useMemo/);
  assert.match(salesTaxPage, /result\?\.currencies\.flatMap\(\(currency\) => currency\.taxGroups\)/);
  assert.match(salesTaxPage, /taxCode, rateCode, rate/);
  assert.match(salesTaxPage, /currencyCode: currencyCode === "ALL" \? undefined : currencyCode/);
  assert.match(salesTaxPage, /taxCode, rateCode: rateCode \|\| undefined, rate/);
  assert.match(salesTaxPage, /headerTotalsScope === "DOCUMENTS_MATCHING_TAX_FILTER"/);
  assert.match(salesTaxPage, /grupos muestran únicamente las líneas coincidentes/);
  assert.doesNotMatch(salesTaxPage, /exemptBase|exoneratedBase|result\.documents\.sort/);
});

test('Sales Tax keeps the active tax-filter note once, before the currency grid and document detail', () => {
  assert.match(salesTaxPage, /headerTotalsScope === "DOCUMENTS_MATCHING_TAX_FILTER"[\s\S]*?role="note"/);
  assert.match(salesTaxPage, /grupos muestran únicamente las líneas coincidentes/);
  const gridPosition = salesTaxPage.indexOf('aria-label="Resumen de impuestos por moneda"');
  const detailPosition = salesTaxPage.indexOf('<CardTitle>Detalle de documentos</CardTitle>');
  assert.ok(gridPosition > -1 && detailPosition > gridPosition, 'document detail remains below the summary grid');
  assert.match(salesTaxPage, /setPage\(\(current\) => Math\.min\(result\.pagination\.totalPages, current \+ 1\)\)/);
  assert.match(salesTaxPage, /getSalesTaxReport\(\{ periodPreset,[\s\S]*?pageSize: PAGE_SIZE/);
});

test('Sales Tax monetary view requests backend projection without client conversion', () => {
  assert.match(salesTaxPage, /Vista monetaria/);
  assert.match(salesTaxPage, /setProjectionMode\("ORIGINAL"\); setPage\(1\)/);
  assert.match(salesTaxPage, /setProjectionMode\("CRC"\); setPage\(1\)/);
  assert.match(salesTaxPage, /projectionMode/);
  assert.doesNotMatch(salesTaxPage, /convertCurrency|exchangeRate\.times|multiplyDecimal/);
});

test('Sales Tax export preserves the active server-side filters and projection mode', () => {
  assert.match(salesTaxPage, /downloadReportingExport\("SALES_TAX", format/);
  assert.match(salesTaxPage, /taxCode, rateCode: rateCode \|\| undefined, rate, projectionMode/);
  assert.match(salesTaxPage, /Exportar/);
});
