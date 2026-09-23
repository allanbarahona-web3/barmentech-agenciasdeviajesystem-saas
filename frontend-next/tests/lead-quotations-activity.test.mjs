import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { leadCommercialActivity } from '../src/features/leads/lead-quotation-activity.ts';

const detail = readFileSync(new URL('../src/app/leads/[id]/page.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/custom-quotations-api.ts', import.meta.url), 'utf8');
const activity = readFileSync(new URL('../src/features/leads/lead-quotation-activity.ts', import.meta.url), 'utf8');
const publicApproval = readFileSync(new URL('../src/app/custom-quotation-approval/[token]/page.tsx', import.meta.url), 'utf8');

test('usa una única lectura acotada por Lead, sin listar globalmente ni leer versiones por cotización', () => {
  assert.match(api, /getLeadCustomQuotationSummaries/);
  assert.match(api, /\/custom-quotations\/lead\/\$\{encodeURIComponent\(leadId\)\}/);
  assert.match(api, /Math\.min\(MAX_PAGE_SIZE/);
  assert.match(detail, /await getLeadCustomQuotationSummaries\(leadId, \{ page \}\)/);
  assert.doesNotMatch(detail, /listCustomQuotations\(|getLatestCustomQuotationVersion\(|getCustomQuotationVersion\(|getCustomQuotationProposal\(/);
});

test('Cotizaciones muestra resúmenes comerciales seguros, estados en español, navegación y paginación', () => {
  assert.match(detail, /quotation\.quotationNumber/);
  assert.match(detail, /quotation\.title/);
  assert.match(detail, /quotationStatusLabel\(quotation\.status\)/);
  assert.match(detail, /formatFinanceMoneyDisplay\(quotation\.latestVersion\.finalSellingPrice, quotation\.currency\)/);
  assert.match(detail, /formatTenantDateTime\(quotation\.createdAt\)/);
  assert.match(detail, /Orden de venta creada/);
  assert.match(detail, /router\.push\(`\/custom-quotations\/\$\{encodeURIComponent\(quotationId\)\}`\)/);
  assert.match(detail, /Este prospecto todavía no tiene cotizaciones/);
  assert.match(detail, /Crear cotización/);
  assert.match(detail, /Anterior/);
  assert.match(detail, /Siguiente/);
  assert.doesNotMatch(detail, /Ver propuesta|proposalAvailable|approvalToken|publicUrl/);
});

test('la actividad se deriva solo de hechos persistidos, se ordena de forma estable y no inventa entrega', () => {
  const events = leadCommercialActivity({
    createdAt: '2026-09-20T10:00:00.000Z',
    convertedAt: '2026-09-23T10:00:00.000Z',
  }, [{
    id: 'quotation-a', quotationNumber: 'CQ-2026-000001', title: 'Viaje', status: 'ACCEPTED', currency: 'USD',
    createdAt: '2026-09-21T10:00:00.000Z', quotationValidUntil: null, customerId: 'customer-a',
    latestVersion: {
      id: 'version-a', versionNumber: 1, status: 'ACCEPTED', finalSellingPrice: '1450.12345',
      createdAt: '2026-09-22T10:00:00.000Z', acceptedAt: '2026-09-23T09:00:00.000Z', rejectedAt: null, salesOrder: null,
    },
  }]);
  assert.deepEqual(events.map((event) => event.label), [
    'Prospecto convertido a cliente',
    'CQ-2026-000001 aceptada',
    'CQ-2026-000001 emitida',
    'CQ-2026-000001 creada',
    'Prospecto creado',
  ]);
  assert.match(activity, /rejectedAt/);
  assert.match(activity, /acceptedAt/);
  assert.doesNotMatch(activity, /correo enviado|PDF visto|link abierto/i);
  assert.match(detail, /formatTenantDateTime\(activity\.timestamp\)/);
});

test('la vista pública no recibe controles ni estado interno del Lead', () => {
  assert.doesNotMatch(publicApproval, /Prospecto creado|Cotizaciones|Orden de venta creada/i);
});
