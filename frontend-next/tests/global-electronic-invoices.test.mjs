import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const viewSource = readFileSync(new URL('../src/app/finance/accounts-receivable/electronic-invoices-view.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../src/app/finance/accounts-receivable/page.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/lib/finance-api.ts', import.meta.url), 'utf8');
const artifactSource = readFileSync(new URL('../src/lib/fiscal-billing-api.ts', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../src/app/finance/accounts-receivable/accounts-receivable.module.css', import.meta.url), 'utf8');

test('global electronic invoices stays in the existing Finance workspace and excludes AGENT', () => {
  assert.match(pageSource, /<ElectronicInvoicesView \/>/);
  assert.match(pageSource, /Cartera<\/button>[\s\S]*Contratos<\/button>[\s\S]*Recibos<\/button>[\s\S]*Facturas electrónicas<\/button>/);
  assert.match(pageSource, /const READ_ROLES = new Set\(\['ADMIN', 'FACTURACION_COBROS', 'CONTADOR'\]\)/);
  assert.doesNotMatch(pageSource, /const READ_ROLES[^\n]*AGENT/);
  assert.match(pageSource, /view === 'electronic-invoices'/);
});

test('the paginated global fiscal read uses the canonical Finance endpoint and business projection', () => {
  assert.match(apiSource, /export function listElectronicInvoices/);
  assert.match(apiSource, /\/finance\/electronic-invoices\$\{queryString\(params\)\}/);
  assert.match(viewSource, /const PAGE_SIZE = 25/);
  assert.match(viewSource, /listElectronicInvoices\(\{ page, pageSize: PAGE_SIZE/);
  assert.match(apiSource, /artifactAvailability: \{ pdf: boolean; xml: boolean; haciendaResponse: boolean \}/);
  assert.match(apiSource, /financialStatus: ElectronicInvoiceFinancialStatus/);
  assert.doesNotMatch(viewSource, /result\.items\.filter\(/);
});

test('the compact table uses readable customer, document, origin, and status presentation', () => {
  assert.match(viewSource, /<TableHead>Fecha<\/TableHead><TableHead>Cliente \/ identificación<\/TableHead><TableHead>Factura<\/TableHead><TableHead>Origen<\/TableHead><TableHead>Total<\/TableHead><TableHead>Estado financiero<\/TableHead><TableHead>Estado fiscal<\/TableHead><TableHead>Acciones<\/TableHead>/);
  assert.match(viewSource, /if \(type === '01'\) return 'Factura electrónica'/);
  assert.match(viewSource, /if \(type === '04'\) return 'Tiquete electrónico'/);
  assert.match(viewSource, /if \(invoice\.sourceType === 'SALES_ORDER'\) return 'Servicios adicionales'/);
  assert.match(viewSource, /if \(invoice\.sourceType === 'CONTRACT_PAYMENT'\) return 'Contrato'/);
  assert.match(viewSource, /Pagada \/ aplicada/);
  assert.match(viewSource, /Parcialmente pagada/);
  assert.match(viewSource, /Aceptada/);
  assert.match(viewSource, /formatFinanceMoney\(invoice\.total, invoice\.currencyCode\)/);
  assert.match(viewSource, /invoice\.customerIdentification \?\? 'Sin identificación'/);
  assert.match(stylesSource, /\.electronicInvoiceTable \{ width: 100%; min-width: 0; table-layout: fixed; \}/);
  assert.match(stylesSource, /\.electronicInvoiceTable th, \.electronicInvoiceTable td \{ vertical-align: top; white-space: normal; overflow-wrap: anywhere; \}/);
});

test('filters remain server-driven and tenant-aware with conditional custom dates', () => {
  for (const field of ['dateFrom', 'dateTo', 'customerSearch', 'currency', 'documentType', 'source', 'fiscalReference']) {
    assert.match(viewSource, new RegExp(`${field}:`));
    assert.match(apiSource, new RegExp(`${field}\\?:`));
  }
  assert.match(viewSource, /taxAuthorityStatus \}, signal\)/);
  assert.match(apiSource, /taxAuthorityStatus\?: ElectronicInvoiceTaxAuthorityStatus/);
  assert.match(viewSource, /useTenantRegional\(\)/);
  assert.match(viewSource, /Hoy/);
  assert.match(viewSource, /Últimos 7 días/);
  assert.match(viewSource, /Últimos 15 días/);
  assert.match(viewSource, /Último mes/);
  assert.match(viewSource, /Mes anterior/);
  assert.match(viewSource, /Personalizado/);
  assert.match(viewSource, /datePreset === 'CUSTOM' \? <>/);
  assert.match(viewSource, /setTaxAuthorityStatus\('ACCEPTED'\)/);
  assert.match(viewSource, /setPage\(\(value\) => Math\.max\(1, value - 1\)\)/);
  assert.match(viewSource, /setPage\(\(value\) => Math\.min\(result\.totalPages, value \+ 1\)\)/);
});

test('detail and artifact actions reuse the existing accepted-invoice infrastructure on demand', () => {
  assert.match(viewSource, /getAcceptedBillingInvoice\(invoice\.billingDocumentId\)/);
  assert.match(viewSource, /listFiscalArtifacts\(invoice\.billingDocumentId\)/);
  assert.match(viewSource, /downloadFiscalArtifact\(openedInvoice\.billingDocumentId, artifact\.artifactType, artifact\.version\)/);
  assert.match(viewSource, /Ver \/ descargar PDF/);
  assert.match(viewSource, /Descargar XML/);
  assert.match(viewSource, /Respuesta Hacienda/);
  assert.match(artifactSource, /\/fiscal-billing\/documents\/\$\{encodeURIComponent\(billingDocumentId\)\}\/artifacts/);
  assert.match(viewSource, /onClick=\{\(\) => void openDetail\(invoice\)\}/);
  assert.doesNotMatch(viewSource, /generateAcceptedInvoicePdf|createOrResumeBillingDraft|requestAcceptedInvoiceEmailResend/);
});
