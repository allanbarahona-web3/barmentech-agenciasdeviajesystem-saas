import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = () => read('../src/app/admin/dashboard/page.tsx');
const dashboard = () => read('../src/features/admin-dashboard/admin-dashboard-content.tsx');
const api = () => read('../src/features/admin-dashboard/admin-dashboard-api.ts');

test('Admin Dashboard uses only the modern reporting endpoint', () => {
  assert.match(api(), /fetchApi\("\/reporting\/admin-dashboard"/);
  assert.doesNotMatch(page() + dashboard(), /billing\/admin\/dashboard-metrics|getBillingDashboardMetrics/);
});

test('period selector maps only to the supported dashboard periods and custom dates', () => {
  const source = dashboard() + api();
  for (const period of ['TODAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'THIS_MONTH', 'CUSTOM']) assert.match(source, new RegExp(`"${period}"`));
  assert.match(api(), /params\.dateFrom = query\.dateFrom/);
  assert.match(api(), /params\.dateTo = query\.dateTo/);
  assert.match(source, /dateFrom > dateTo/);
});

test('Configuration remains an explicit route to settings', () => {
  assert.match(page(), /router\.push\("\/settings"\)/);
  assert.match(dashboard(), /Configuración/);
});

test('currency selection filters records instead of combining currencies', () => {
  const source = dashboard();
  assert.match(source, /amountForCurrency\(data\.receivables\.outstandingByCurrency, selectedCurrency\)/);
  assert.match(source, /const points = data\.filter\(\(item\) => item\.currencyCode === currency\)/);
  assert.match(source, /rows\.filter\(\(row\) => row\.currencyCode === currency\)/);
  assert.doesNotMatch(source, /reduce\([^)]*amount/);
});

test('modern pending verification and supported metrics render without unsupported dashboard claims', () => {
  const source = dashboard();
  assert.match(source, /data\.payments\.pendingVerificationCount/);
  assert.match(source, /data\.sales\.orderCount/);
  assert.match(source, /Órdenes de venta/);
  for (const unsupported of ['Agent ranking', 'Agent performance', 'Average ticket', 'Gross margin', 'Profitability', 'Active trips']) assert.doesNotMatch(source, new RegExp(unsupported, 'i'));
});

test('dashboard provides loading, empty, error, responsive table, and accessible chart states', () => {
  const source = dashboard();
  for (const label of ['Cargando dashboard administrativo', 'No hay datos para este período', 'No se pudo cargar el dashboard', 'md:hidden', 'role="tooltip"']) assert.match(source, new RegExp(label));
  assert.match(source, /No hay pagos diarios para la moneda seleccionada/);
});
