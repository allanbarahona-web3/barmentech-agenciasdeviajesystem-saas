import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../src/lib/custom-quotations-api.ts', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/app/custom-quotations/[id]/page.tsx', import.meta.url), 'utf8');
const proposalTab = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationProposalTab.tsx', import.meta.url), 'utf8');
const completion = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationSalesOrderCompletion.tsx', import.meta.url), 'utf8');
const conversion = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationLeadCustomerConversion.tsx', import.meta.url), 'utf8');
const publicApproval = readFileSync(new URL('../src/app/custom-quotation-approval/[token]/page.tsx', import.meta.url), 'utf8');

test('una cotización aceptada con cliente materializa desde la versión inmutable sin autoridad del cliente', () => {
  assert.match(detail, /CustomQuotationProposalTab quotation=\{quotation\} commercialLines=\{commercialLines\} stateRevision=\{quoteStateRevision\} onIssued=\{refreshQuotation\} onQuotationRefreshed=\{refreshQuotation\}/);
  assert.match(proposalTab, /CustomQuotationSalesOrderCompletion quotation=\{quotation\} version=\{version\} onVersionRefreshed=\{refreshVersion\} onQuotationRefreshed=\{onQuotationRefreshed\}/);
  assert.match(completion, /const canMaterialize = isAccepted && quotation\.customerId !== null/);
  assert.match(completion, /!version\.salesOrder \? <Button/);
  assert.match(completion, /Crear orden de venta/);
  assert.match(api, /materializeCustomQuotationSalesOrder.*\/versions\/\$\{encodeURIComponent\(versionId\)\}\/sales-order.*'POST'/);
  assert.doesNotMatch(api, /materializeCustomQuotationSalesOrder[\s\S]{0,220}(finalSellingPrice|currency|fiscal|customerId|tenantId|line)/i);
});

test('Cotización destaca la aceptación y guía el flujo interno sin exponerlo al cliente', () => {
  assert.match(proposalTab, /quotation\.status === 'ACCEPTED'/);
  assert.match(proposalTab, /Alert variant="success" role="status"/);
  assert.match(proposalTab, /Cotización aceptada/);
  assert.match(proposalTab, /Esta cotización fue aceptada y está lista para continuar con el proceso comercial/);
  assert.match(proposalTab, /version\.acceptedAt/);
  assert.match(proposalTab, /formatTenantDateTime\(version\.acceptedAt\)/);
  assert.match(completion, /CustomQuotationLeadCustomerConversion/);
  assert.match(conversion, /Completar cliente/);
  assert.match(completion, /Crear orden de venta/);
  assert.doesNotMatch(publicApproval, /Completar cliente|Crear orden de venta|Orden de venta creada/);
});

test('una cotización aceptada de prospecto exige completar cliente y se refresca desde backend', () => {
  assert.match(completion, /const requiresCustomer = isAccepted && Boolean\(quotation\.leadId\) && quotation\.customerId === null/);
  assert.match(completion, /Completa los datos del cliente antes de generar la orden de venta/);
  assert.match(completion, /CustomQuotationLeadCustomerConversion/);
  assert.match(completion, /onConversionCompleted=\{\(\) => \{ setConversionMessage\('El prospecto fue convertido correctamente en cliente\.'\); void onQuotationRefreshed\(\); \}\}/);
  assert.match(completion, /onVersionRefreshed/);
});

test('la orden existente se toma de la versión persistida y no de estado optimista', () => {
  assert.match(api, /salesOrder: \{ id: string; orderNumber: string \| null \} \| null/);
  assert.match(completion, /version\.salesOrder\.orderNumber/);
  assert.match(completion, /Orden de venta creada/);
  assert.match(completion, /await materializeCustomQuotationSalesOrder\(quotation\.id, version\.versionId\)/);
  assert.match(completion, /const persistedVersion = await onVersionRefreshed\(\)/);
  assert.match(completion, /if \(!persistedVersion\?\.salesOrder\)/);
  assert.match(completion, /disabled=\{materializing\}/);
  assert.match(completion, /Creando orden de venta\.\.\./);
});

test('los controles se limitan al workspace interno y no exponen billing ni datos internos', () => {
  assert.match(completion, /if \(!isAccepted\) return null/);
  assert.doesNotMatch(publicApproval, /SalesOrder|orden de venta|sales-order/i);
  assert.doesNotMatch(`${api}\n${completion}`, /billing-api|account-receivable|authoritativeCostAmount|PricingConfiguration|TenantPricingPolicy|riskMarginPercent|salesCommissionPercent|bankCommissionPercent|agencyProfit|CABYS|UoM|taxCode|taxRate/i);
});
