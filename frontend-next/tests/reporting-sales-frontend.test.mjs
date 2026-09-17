import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const nav = readFileSync(new URL('../src/components/vertical-nav.tsx', import.meta.url), 'utf8');
const registry = readFileSync(new URL('../src/features/reporting/report-registry.ts', import.meta.url), 'utf8');
const guard = readFileSync(new URL('../src/features/reporting/report-route-guard.tsx', import.meta.url), 'utf8');
const reportsHome = readFileSync(new URL('../src/app/reports/page.tsx', import.meta.url), 'utf8');
const salesPage = readFileSync(new URL('../src/app/reports/sales/page.tsx', import.meta.url), 'utf8');
const reportingApi = readFileSync(new URL('../src/lib/reporting-api.ts', import.meta.url), 'utf8');

test('new Reportes navigation is visible only to ADMIN and CONTADOR', () => {
  assert.match(nav, /Reporting Engine: readonly reports[\s\S]*?\.\.\.\(isAdminOrContador/);
  assert.match(nav, /href: "\/reports"/);
  assert.match(registry, /allowedRoles: \["ADMIN", "CONTADOR"\]/);
  assert.doesNotMatch(registry, /"FACTURACION_COBROS"|"OPERACIONES"|"AGENT"/);
});

test('reports routes enforce report-level presentation access before rendering', () => {
  assert.match(guard, /canAccessReport\(role, reportKey\)/);
  assert.match(guard, /router\.replace\(getHomeRouteForRole\(role\)\)/);
  assert.match(reportsHome, /<ReportRouteGuard>/);
  assert.match(salesPage, /<ReportRouteGuard reportKey="SALES">/);
});

test('Reports home uses the registry and exposes the enabled Sales report', () => {
  assert.match(reportsHome, /reportsForRole\(getStoredSession\(\)\?\.user\?\.role\)/);
  assert.match(registry, /key: "SALES"[\s\S]*?available: true/);
});

test('Sales UI uses only the Reporting endpoint and all supported period presets', () => {
  assert.match(reportingApi, /fetchApi\("\/reporting\/sales"/);
  assert.doesNotMatch(reportingApi, /\/billing\/admin\/reports|BillingInvoice|BillingPayment|BillingCreditNote/);
  for (const period of ['TODAY', 'LAST_7_DAYS', 'LAST_15_DAYS', 'CURRENT_MONTH', 'PREVIOUS_MONTH', 'CUSTOM']) {
    assert.match(salesPage, new RegExp(`value: "${period}"`));
  }
  assert.match(salesPage, /periodPreset === "CUSTOM"/);
  assert.match(salesPage, /type="date"/);
  assert.match(salesPage, /El período se resuelve con la zona horaria fiscal del tenant/);
});

test('Sales UI keeps currencies separate and labels generic document effects', () => {
  assert.match(salesPage, /result\.currencies\.map\(\(summary\) => <SummaryCard/);
  assert.match(salesPage, /formatFinanceMoneyDisplay\(value, currencyCode\)/);
  assert.match(salesPage, /effect === "INCREASE" \? "Aumenta ventas" : "Disminuye ventas"/);
  assert.doesNotMatch(salesPage, /convertCurrency|exchangeRate|Contract|TravelPackage|Reservation/);
});

test('Sales details use backend pagination and distinguish loading, empty, and error states', () => {
  assert.match(salesPage, /const PAGE_SIZE = 25/);
  assert.match(salesPage, /getSalesReport\(\{ periodPreset,[\s\S]*?pageSize: PAGE_SIZE/);
  assert.match(salesPage, /setPage\(\(current\) => Math\.max\(1, current - 1\)\)/);
  assert.match(salesPage, /No hay documentos fiscales aceptados para el período seleccionado\./);
  assert.match(salesPage, /No se pudo cargar el reporte/);
});

test('Sales report header has a clear return action to the Reports workspace', () => {
  assert.match(salesPage, /<Link href="\/reports">Volver a reportes<\/Link>/);
  assert.match(salesPage, />Actualizar</);
});

test('Sales filters condition and currency server-side, resets pagination, and does not client-sort details', () => {
  assert.match(salesPage, /Condición de venta/);
  assert.match(salesPage, /<option value="CASH">Contado<\/option>/);
  assert.match(salesPage, /<option value="CREDIT">Crédito<\/option>/);
  assert.match(salesPage, /<option value="CRC">CRC<\/option>/);
  assert.match(salesPage, /<option value="USD">USD<\/option>/);
  assert.match(salesPage, /saleCondition: saleCondition === "ALL" \? undefined : saleCondition/);
  assert.match(salesPage, /currencyCode: currencyCode === "ALL" \? undefined : currencyCode/);
  assert.match(salesPage, /setSaleCondition\(event\.target\.value/);
  assert.match(salesPage, /setCurrencyCode\(event\.target\.value\)/);
  assert.doesNotMatch(salesPage, /result\.documents\.sort/);
});

test('Sales monetary view is backend-driven and resets pagination for Original and CRC', () => {
  assert.match(salesPage, /Vista monetaria/);
  assert.match(salesPage, /setProjectionMode\("ORIGINAL"\); setPage\(1\)/);
  assert.match(salesPage, /setProjectionMode\("CRC"\); setPage\(1\)/);
  assert.match(salesPage, /projectionMode/);
  assert.doesNotMatch(salesPage, /convertCurrency|exchangeRate\.times|multiplyDecimal/);
});

test('Sales export sends the current server-side report state without client calculation', () => {
  assert.match(salesPage, /downloadReportingExport\("SALES", format/);
  assert.match(salesPage, /saleCondition: saleCondition === "ALL" \? undefined : saleCondition/);
  assert.match(salesPage, /currencyCode: currencyCode === "ALL" \? undefined : currencyCode/);
  assert.match(salesPage, /projectionMode/);
  assert.match(salesPage, /Exportar/);
});
