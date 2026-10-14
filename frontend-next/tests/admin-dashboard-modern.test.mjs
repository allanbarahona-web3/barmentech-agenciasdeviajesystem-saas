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
  assert.match(source, /const \[selectedCurrency, setSelectedCurrency\] = useState<string>\("USD"\)/);
  assert.match(source, /DASHBOARD_CURRENCIES = \["USD", "CRC"\]/);
  assert.doesNotMatch(source, /options\[0\]/);
  assert.match(source, /amountForCurrency\(data\.receivables\.outstandingByCurrency, selectedCurrency\)/);
  assert.match(source, /amountForCurrency\(data\.commercial\.contractedSales\.totalByCurrency, selectedCurrency\)/);
  assert.match(source, /amountForCurrency\(data\.fiscal\.netSalesByCurrency, selectedCurrency\)/);
  assert.match(source, /amountForCurrency\(data\.commercial\.averageContractTicketByCurrency, selectedCurrency\)/);
  assert.match(source, /onClick=\{\(\) => setSelectedCurrency\(currency\)\}/);
  assert.match(source, /const points = data\.filter\(\(item\) => item\.currencyCode === currency\)/);
  assert.match(source, /rows\.filter\(\(row\) => row\.currencyCode === currency\)/);
  assert.match(source, /no se suman ni convierten/i);
  assert.doesNotMatch(source, /exchangeRate|convertCurrency|fxRate/i);
  assert.doesNotMatch(source, /reduce\([^)]*amount/);
});

test('commercial, fiscal, operational, and passenger-trend metrics use the modern dashboard response only', () => {
  const source = dashboard() + api();
  assert.match(source, /data\.payments\.pendingVerificationCount/);
  assert.match(source, /data\.sales\.orderCount/);
  assert.match(source, /Ventas contratadas/);
  assert.match(source, /Ventas facturadas/);
  assert.match(source, /Ticket promedio/);
  assert.match(source, /data\.operations\.activeTripsCount/);
  assert.match(source, /data\.operations\.activePassengersCount/);
  assert.match(source, /Evolución de pasajeros contratados/);
  assert.match(source, /data\.commercial\.passengerTrend/);
  assert.match(source, /passengerCount/);
  assert.match(source, /Órdenes de venta/);
  for (const unsupported of ['Ranking de agentes', 'Rendimiento de agentes', 'Margen bruto', 'Rentabilidad', 'Nómina', 'Pasajeros viajados', 'Proyección de ventas']) assert.doesNotMatch(source, new RegExp(unsupported, 'i'));
});

test('dashboard provides loading, empty, error, responsive charts, and intentional selected-currency empty states', () => {
  const source = dashboard();
  for (const label of ['Cargando dashboard administrativo', 'No hay datos para este período', 'No se pudo cargar el dashboard', 'md:hidden', 'role="tooltip"']) assert.match(source, new RegExp(label));
  assert.match(source, /No hay pagos diarios para la moneda seleccionada/);
  assert.match(source, /Sin contratos aprobados para la moneda seleccionada/);
  assert.match(source, /Sin ventas fiscales netas para la moneda seleccionada/);
  assert.match(source, /No hay participaciones contratadas para mostrar/);
});
