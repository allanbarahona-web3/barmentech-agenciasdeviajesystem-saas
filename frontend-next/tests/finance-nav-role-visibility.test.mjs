import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const nav = readFileSync(new URL('../src/components/vertical-nav.tsx', import.meta.url), 'utf8');
const dashboardPage = readFileSync(new URL('../src/app/admin/dashboard/page.tsx', import.meta.url), 'utf8');
const historyPage = readFileSync(new URL('../src/app/history/page.tsx', import.meta.url), 'utf8');
const auditPage = readFileSync(new URL('../src/app/billing/audit/page.tsx', import.meta.url), 'utf8');
const billingPage = readFileSync(new URL('../src/app/billing/page.tsx', import.meta.url), 'utf8');
const billingDetailPage = readFileSync(new URL('../src/app/billing/[contractId]/page.tsx', import.meta.url), 'utf8');
const financePage = readFileSync(new URL('../src/app/finance/accounts-receivable/page.tsx', import.meta.url), 'utf8');
const exchangeRatePage = readFileSync(new URL('../src/app/admin/exchange-rate/page.tsx', import.meta.url), 'utf8');

test('CONTADOR and FACTURACION_COBROS do not see Historial, while ADMIN retains it', () => {
  assert.match(nav, /role !== "FACTURACION_COBROS" && !isContador/);
  assert.match(nav, /isAdmin = role === "ADMIN"/);
  assert.match(nav, /href: "\/history"/);
  assert.match(historyPage, /\["ADMIN", "AGENT", "OPERACIONES", "VENTAS"\]\.includes\(role\)/);
});

test('Dashboard is ADMIN-only in navigation and direct route authorization', () => {
  assert.match(nav, /Dashboard de gestión exclusivamente administrativo\.[\s\S]*?\.\.\.\(isAdmin/);
  assert.doesNotMatch(nav, /Dashboard de gestión exclusivamente administrativo\.\s*\.\.\.\(isAdminOrContador/);
  assert.match(dashboardPage, /const authorized = role === "ADMIN"/);
});

test('Reporting Engine is available to ADMIN and CONTADOR without legacy Reports navigation', () => {
  assert.match(nav, /Reporting Engine: readonly reports are available through their own domain\.[\s\S]*?\.\.\.\(isAdminOrContador/);
  assert.match(nav, /href: "\/reports"/);
  assert.doesNotMatch(nav, /billing\/admin\/reports/);
});

test('only ADMIN sees Auditoría and its existing route guard remains ADMIN-only', () => {
  assert.match(nav, /Auditoría de Billing es exclusivamente administrativa\.[\s\S]*?\.\.\.\(isAdmin/);
  assert.doesNotMatch(nav, /Auditoría de Billing es exclusivamente administrativa\.\s*\.\.\.\(isAdminOrContador/);
  assert.match(auditPage, /if \(role !== "ADMIN"\)/);
});

test('legacy Estados de cuenta is absent for CONTADOR and FACTURACION_COBROS and direct routes redirect them', () => {
  assert.match(nav, /\.\.\.\(isAdmin \? \[\{[\s\S]*?href: "\/billing"/);
  assert.match(billingPage, /\["CONTADOR", "FACTURACION_COBROS"\]\.includes\(role\)/);
  assert.match(billingDetailPage, /\["CONTADOR", "FACTURACION_COBROS"\]\.includes\(role\)/);
});

test('Finance workspace remains visible to CONTADOR and operational for FACTURACION_COBROS', () => {
  assert.match(nav, /isAdminOrContador \|\| role === "FACTURACION_COBROS"/);
  assert.match(nav, /href: "\/finance\/accounts-receivable"/);
  assert.match(financePage, /const READ_ROLES = new Set\(\['ADMIN', 'FACTURACION_COBROS', 'CONTADOR'\]\)/);
  assert.match(financePage, /const WRITE_ROLES = new Set\(\['ADMIN', 'FACTURACION_COBROS'\]\)/);
});

test('Calculator and current exchange-rate visibility remain unchanged', () => {
  assert.match(nav, /onClick=\{\(\) => setShowCalculator\(true\)\}/);
  assert.match(nav, /<CurrencyCalculator isOpen=\{showCalculator\}/);
  assert.match(nav, /\{exchangeRate \? \(/);
  assert.match(exchangeRatePage, /const canEdit = role === "ADMIN"/);
});

test('ADMIN navigation remains available for Dashboard, Finance, Reports, audit, and configuration', () => {
  for (const href of ["/admin/dashboard", "/finance/accounts-receivable", "/billing", "/reports", "/billing/audit", "/admin/exchange-rate"]) {
    assert.match(nav, new RegExp(`href: "${href.replaceAll('/', '\\/')}"`));
  }
  assert.doesNotMatch(nav, /billing\/admin\/reports/);
});
