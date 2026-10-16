import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canAccessLeadWorkspace,
  leadStatusLabel,
} from '../src/features/leads/lead-workspace.ts';

const navigationSource = readFileSync(new URL('../src/components/vertical-nav.tsx', import.meta.url), 'utf8');
const listSource = readFileSync(new URL('../src/app/leads/page.tsx', import.meta.url), 'utf8');
const detailSource = readFileSync(new URL('../src/app/leads/[id]/page.tsx', import.meta.url), 'utf8');
const leadsApiSource = readFileSync(new URL('../src/lib/leads-api.ts', import.meta.url), 'utf8');
const quotationsApiSource = readFileSync(new URL('../src/lib/custom-quotations-api.ts', import.meta.url), 'utf8');
const quotationEditorSource = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationEditorDialog.tsx', import.meta.url), 'utf8');

test('la navegación muestra Prospectos solo para los roles comerciales autorizados', () => {
  assert.match(navigationSource, /isAdmin \|\| role === "AGENT"/);
  assert.match(navigationSource, /href: "\/leads"/);
  assert.match(navigationSource, /label: "Prospectos"/);
  assert.equal(canAccessLeadWorkspace('ADMIN'), true);
  assert.equal(canAccessLeadWorkspace('AGENT'), true);
  assert.equal(canAccessLeadWorkspace('FACTURACION_COBROS'), false);
});

test('el listado solicita una página acotada con búsqueda y estado en la API', () => {
  assert.match(leadsApiSource, /LEAD_LIST_DEFAULT_PAGE_SIZE = 20/);
  assert.match(leadsApiSource, /LEAD_LIST_MAX_PAGE_SIZE = 25/);
  assert.match(leadsApiSource, /Math\.min\(\s*LEAD_LIST_MAX_PAGE_SIZE/);
  assert.match(leadsApiSource, /\$\{apiBase\}\/leads\?\$\{buildLeadListQuery\(params\)\}/);
  assert.match(listSource, /pageSize: LEAD_LIST_DEFAULT_PAGE_SIZE/);
  assert.match(listSource, /status: requestedStatus === 'ALL' \? undefined : requestedStatus/);
  assert.match(listSource, /search: requestedSearch \|\| undefined/);
});

test('el listado muestra los estados en español y reutiliza el modal de creación', () => {
  assert.equal(leadStatusLabel('OPEN'), 'Abierto');
  assert.equal(leadStatusLabel('CONVERTED'), 'Convertido');
  assert.match(listSource, /LeadQuickCreateModal/);
  assert.match(listSource, /onLeadCreated=\{handleLeadCreated\}/);
  assert.match(listSource, /void loadLeads\(\{ page: 1, search: '', status: 'ALL' \}\)/);
});

test('el detalle carga el prospecto y muestra conversión y fechas con la zona horaria del tenant', () => {
  assert.match(detailSource, /await getLead\(leadId\)/);
  assert.match(detailSource, /useTenantDateTimeFormatter/);
  assert.match(detailSource, /formatTenantDateTime\(lead\.createdAt\)/);
  assert.match(detailSource, /formatTenantDateTime\(lead\.updatedAt\)/);
  assert.match(detailSource, /Prospecto convertido/);
  assert.doesNotMatch(`${listSource}\n${detailSource}`, /new Date\(/);
});

test('Cotizaciones y Actividad son pestañas reales, sin cambiar el Resumen', () => {
  assert.match(detailSource, /activeTab === 'SUMMARY'/);
  assert.match(detailSource, />Cotizaciones<\/Button>/);
  assert.match(detailSource, />Actividad<\/Button>/);
  assert.doesNotMatch(detailSource, /Cotizaciones · Próximamente|Actividad · Próximamente/);
  assert.match(detailSource, /Información comercial del prospecto/);
  assert.match(quotationsApiSource, /getLeadCustomQuotationSummaries/);
});

test('un Lead abierto crea una cotización con el diálogo compartido y conserva el flujo existente', () => {
  assert.match(detailSource, /CustomQuotationEditorDialog/);
  assert.match(detailSource, /lead\.status === 'OPEN' \? <Button[^>]*>.*Crear cotización/);
  assert.match(detailSource, /onCreateQuotation=\{\(\) => setCreateQuotationOpen\(true\)\}/);
  assert.match(detailSource, /initialLead=\{lead\.status === 'OPEN' \? lead : null\}/);
  assert.match(detailSource, /createCustomQuotation\(input\)/);
  assert.match(detailSource, /router\.push\(`\/custom-quotations\/\$\{created\.id\}`\)/);
  assert.match(quotationEditorSource, /initialLead\?: Lead \| null/);
  assert.match(quotationEditorSource, /\(!quotation \? initialLead \?\? null : null\)/);
  assert.match(quotationEditorSource, /selectedLead \? 'LEAD' : null/);
  assert.match(quotationEditorSource, /Prospecto seleccionado/);
  assert.match(quotationEditorSource, /const leadId = mode === 'LEAD' \? lead\?\.id \?\? null : null/);
});
