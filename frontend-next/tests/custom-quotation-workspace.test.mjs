import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  hasExactlyOneQuotationTarget,
  paymentConditionLabel,
  quotationStatusLabel,
  quotationTargetLabel,
} from '../src/features/custom-quotations/custom-quotation-presentation.ts';

const actionMenu = readFileSync(new URL('../src/components/action-menu-modal.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/app/agent-dashboard/page.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/custom-quotations-api.ts', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationEditorDialog.tsx', import.meta.url), 'utf8');
const list = readFileSync(new URL('../src/app/custom-quotations/page.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/app/custom-quotations/[id]/page.tsx', import.meta.url), 'utf8');
const proposalTab = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationProposalTab.tsx', import.meta.url), 'utf8');
const salesOrderCompletion = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationSalesOrderCompletion.tsx', import.meta.url), 'utf8');

test('la Solicitud de Cotización está habilitada y lleva al workspace', () => {
  const quotationAction = actionMenu.split('Opción 6:')[1].split('Opción 7:')[0];
  assert.match(actionMenu, /onClick=\{onSelectQuote\}/);
  assert.doesNotMatch(quotationAction, /disabled/);
  assert.match(dashboard, /router\.push\('\/custom-quotations'\)/);
});

test('el listado usa la API paginada y presenta estados y destinatarios en español', () => {
  assert.match(api, /PAGE_SIZE = 20/);
  assert.match(api, /MAX_PAGE_SIZE = 25/);
  assert.match(api, /\/custom-quotations\?\$\{query\}/);
  assert.equal(quotationStatusLabel('DRAFT'), 'Borrador');
  assert.equal(quotationStatusLabel('ACCEPTED'), 'Aceptada');
  assert.equal(quotationTargetLabel({ type: 'LEAD' }), 'Prospecto');
  assert.equal(quotationTargetLabel({ type: 'CUSTOMER' }), 'Cliente');
  assert.match(list, /formatTenantDateTime\(q\.createdAt\)/);
});

test('el editor exige un solo destinatario y reutiliza selector de cliente y creación de prospecto', () => {
  assert.equal(hasExactlyOneQuotationTarget('lead-1', null), true);
  assert.equal(hasExactlyOneQuotationTarget(null, 'customer-1'), true);
  assert.equal(hasExactlyOneQuotationTarget('lead-1', 'customer-1'), false);
  assert.equal(hasExactlyOneQuotationTarget(null, null), false);
  assert.match(editor, /CustomerSearchSelector/);
  assert.match(editor, /LeadQuickCreateModal/);
  assert.match(editor, /setLead\(created\)/);
  assert.match(editor, /\.\.\.\(leadId \? \{ leadId \} : \{ customerId: customerId! \}\)/);
});

test('el detalle muestra sólo servicios comerciales derivados y no permite líneas libres', () => {
  assert.match(detail, /const draft = quotation\.status === 'DRAFT'/);
  assert.match(detail, /Editar detalle/);
  assert.match(api, /getCustomQuotationCommercialLines/);
  assert.match(api, /\/commercial-lines/);
  assert.match(detail, /Servicios cotizados/);
  assert.match(detail, /No hay servicios agregados a esta cotización/);
  assert.match(detail, /Agrega los servicios desde la sección de Costos/);
  assert.match(detail, /Ir a Costos/);
  assert.doesNotMatch(detail, /addCustomQuotationLine|updateCustomQuotationLine|removeCustomQuotationLine|reorderCustomQuotationLines|Agregar línea|Editar línea|Eliminar línea|Subir línea|Bajar línea/);
  assert.match(detail, /onClick=\{\(\) => void openCosts\(\)\}>Costos/);
  assert.match(detail, /setActiveTab\('QUOTE'\)/);
  assert.match(detail, />Cotización<\/Button>/);
  assert.doesNotMatch(detail, /openPricing|activeTab === 'PRICE'|activeTab === 'PROPOSAL'|>Precio<\/Button>|>Propuesta<\/Button>/);
  assert.match(detail, /CustomQuotationProposalTab/);
});

test('la conversión reutiliza el componente existente y se excluye de cotizaciones con cliente', () => {
  assert.match(proposalTab, /CustomQuotationSalesOrderCompletion/);
  assert.match(proposalTab, /quotation\.status === 'ACCEPTED'/);
  assert.match(salesOrderCompletion, /CustomQuotationLeadCustomerConversion/);
  assert.match(salesOrderCompletion, /const isAccepted = quotation\.status === 'ACCEPTED'/);
  assert.match(editor, /customerId: customerId!/);
});

test('el tab Costos resuelve un CostingProject independiente y reutiliza la composición genérica', () => {
  assert.match(api, /\/custom-quotations\/\$\{encodeURIComponent\(id\)\}\/costing-project/);
  assert.match(api, /method: 'POST'/);
  assert.match(detail, /resolveCustomQuotationCostingProject\(id\)/);
  assert.match(api, /createCustomQuotationCostEngineApi/);
  assert.match(api, /\/custom-quotations\/\$\{encodeURIComponent\(quotationId\)\}\/cost-engine/);
  assert.match(api, /\$\{scope\}\/composition/);
  assert.match(api, /\$\{scope\}\/components/);
  assert.match(detail, /GenericCostComposition costingProjectId=\{costingProject\.costingProjectId\} baseCurrency=\{costingProject\.baseCurrency\} canEdit=\{quotation\.status === 'DRAFT'\}[\s\S]*api=\{scopedCostApi\}/);
  assert.match(detail, /onCompositionChanged=\{handleCompositionChanged\}/);
  assert.match(detail, /setActiveTab\('COSTS'\)/);
  assert.match(detail, /setActiveTab\('DETAIL'\)/);
  assert.doesNotMatch(detail, /\/admin\/cost-engine|AirfareEvolutionDialog|AirfareDailyTaskDialog|PricingWorkspace/);
});

test('Cotización consume solo el contrato comercial de precios', () => {
  assert.match(api, /getCustomQuotationPricing/);
  assert.match(api, /calculateCustomQuotationPricing/);
  assert.match(api, /\/custom-quotations\/\$\{encodeURIComponent\(id\)\}\/pricing/);
  assert.match(proposalTab, /No hay un precio calculado todavía/);
  assert.match(proposalTab, /Calcular precio/);
  assert.match(proposalTab, /Recalcular precio/);
  assert.match(proposalTab, /Estado del precio/);
  assert.doesNotMatch(`${detail}\n${proposalTab}`, /Precio comercial|PricingWorkspace|pricing-api|travel-pricing|riskMarginPercent|salesCommissionPercent|bankCommissionPercent|agency profit/i);
});

test('la UI comercial no expone fiscalidad ni valores internos de pricing', () => {
  const source = `${api}\n${editor}\n${list}\n${detail}\n${proposalTab}`;
  assert.doesNotMatch(source, /fiscalClassificationId|CABYS|UoM|taxCode|taxRate|TenantPricingPolicy|PricingConfiguration|authoritativeCostAmount|operationalCostsAmount|riskMarginPercent|targetProfitMarginPercent|salesCommissionPercent|bankCommissionPercent|applicableTaxPercent|targetProfitAmount|commissionAmount|agencyProfit|pricing-api/i);
  assert.equal(paymentConditionLabel('CREDIT', 30, 'DAYS'), 'Crédito · 30 días');
});

test('la pestaña Propuesta emite sin autoridad financiera del cliente y refresca snapshots inmutables', () => {
  assert.match(api, /issueCustomQuotation.*\/issue.*'POST'/);
  assert.match(api, /getLatestCustomQuotationVersion.*\/versions\/latest.*'GET'/);
  assert.match(api, /getCustomQuotationVersion.*\/versions\/\$\{encodeURIComponent\(versionId\)\}.*'GET'/);
  assert.match(proposalTab, /await issueCustomQuotation\(quotation\.id\)/);
  assert.match(proposalTab, /const issued = await refreshVersion\(\{ loadDocument: true \}\)/);
  assert.match(proposalTab, /await onIssued\(\)/);
  assert.match(proposalTab, /request = getLatestCustomQuotationVersion\(quotation\.id\)/);
  assert.match(proposalTab, /disabled=\{issuing \|\| issueBlocked\}/);
  assert.match(proposalTab, /Emitiendo…/);
  assert.doesNotMatch(api, /issueCustomQuotation[\s\S]{0,180}(finalSellingPrice|fiscalClassificationId|recipientFullName|tenantId)/);
});

test('Propuesta guía los prerrequisitos de borrador y renderiza sólo snapshots emitidos', () => {
  assert.match(proposalTab, /Calcula el precio antes de emitir la cotización/);
  assert.match(proposalTab, /Los costos cambiaron\. Recalcula el precio antes de emitir/);
  assert.match(proposalTab, /Agrega al menos un servicio desde Costos antes de emitir la cotización/);
  assert.match(proposalTab, /commercialLines\.map/);
  assert.doesNotMatch(proposalTab, /quotation\.lines/);
  assert.match(proposalTab, /version\.recipientFullName/);
  assert.match(proposalTab, /version\.recipientEmail/);
  assert.match(proposalTab, /version\.lines\.map/);
  assert.match(proposalTab, /formatFinanceMoneyDisplay\(version\.finalSellingPrice, version\.currency\)/);
  assert.match(proposalTab, /formatTenantDateTime\(version\.createdAt\)/);
  assert.doesNotMatch(proposalTab, /quotation\.target\?\.displayName[\s\S]{0,400}Propuesta emitida/);
});

test('Cotización usa el documento firmado inmutable sin depender de controles públicos', () => {
  assert.match(api, /generateCustomQuotationProposal.*\/proposal.*'POST'/);
  assert.match(api, /getCustomQuotationProposal/);
  assert.match(proposalTab, /Generar PDF/);
  assert.match(proposalTab, /Ver propuesta/);
  assert.match(proposalTab, /href=\{proposal\.url\} target="_blank" rel="noreferrer"/);
  assert.doesNotMatch(proposalTab, /approvalToken|approvalUrl|publicUrl|\/public\/custom-quotation-approval/);
});

test('la entrega sólo usa la versión emitida, PDF existente y el endpoint de cotización', () => {
  assert.match(api, /sendCustomQuotationProposal.*\/versions\/\$\{encodeURIComponent\(versionId\)\}\/send.*'POST'/);
  assert.match(proposalTab, /version\.status === 'ISSUED'/);
  assert.match(proposalTab, /Genera la propuesta antes de enviarla/);
  assert.match(proposalTab, /Enviar por correo/);
  assert.match(proposalTab, /sendCustomQuotationProposal\(quotation\.id, version\.versionId\)/);
  assert.match(proposalTab, /disabled=\{sending\}/);
  assert.match(proposalTab, /Enviando…/);
  assert.match(proposalTab, /Cotización enviada correctamente/);
  assert.match(proposalTab, /version\.recipientFullName/);
  assert.match(proposalTab, /version\.recipientEmail/);
  assert.doesNotMatch(api, /sendCustomQuotationProposal[\s\S]{0,180}(recipientEmail|approvalToken|finalSellingPrice|tenantId)/);
});

test('la entrega conserva el estado comercial y protege datos internos, tokens y rutas públicas', () => {
  const sendFunction = proposalTab.split('async function sendProposal()')[1].split('if (draft)')[0];
  assert.doesNotMatch(sendFunction, /onIssued|setQuotation|router\.|window\./);
  assert.match(proposalTab, /deliveryErrorMessage/);
  assert.match(proposalTab, /La cotización no tiene un correo de destinatario válido/);
  assert.match(proposalTab, /La cotización venció y no puede enviarse/);
  assert.doesNotMatch(proposalTab, /approvalToken|approvalUrl|publicUrl|providerId|emailId/);
});
