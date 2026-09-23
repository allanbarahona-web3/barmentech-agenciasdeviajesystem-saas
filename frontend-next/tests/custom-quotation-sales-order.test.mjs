import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../src/lib/custom-quotations-api.ts', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/app/custom-quotations/[id]/page.tsx', import.meta.url), 'utf8');
const completion = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationSalesOrderCompletion.tsx', import.meta.url), 'utf8');
const publicApproval = readFileSync(new URL('../src/app/custom-quotation-approval/[token]/page.tsx', import.meta.url), 'utf8');

test('una cotización aceptada con cliente materializa desde la versión inmutable sin autoridad del cliente', () => {
  assert.match(detail, /CustomQuotationSalesOrderCompletion quotation=\{quotation\} onQuotationRefreshed=\{load\}/);
  assert.match(completion, /const canMaterialize = isAccepted && quotation\.customerId !== null/);
  assert.match(completion, /version && !version\.salesOrder/);
  assert.match(completion, /Crear orden de venta/);
  assert.match(api, /materializeCustomQuotationSalesOrder.*\/versions\/\$\{encodeURIComponent\(versionId\)\}\/sales-order.*'POST'/);
  assert.doesNotMatch(api, /materializeCustomQuotationSalesOrder[\s\S]{0,220}(finalSellingPrice|currency|fiscal|customerId|tenantId|line)/i);
});

test('una cotización aceptada de prospecto exige completar cliente y se refresca desde backend', () => {
  assert.match(completion, /const requiresCustomer = isAccepted && Boolean\(quotation\.leadId\) && quotation\.customerId === null/);
  assert.match(completion, /Completa los datos del cliente antes de generar la orden de venta/);
  assert.match(completion, /CustomQuotationLeadCustomerConversion/);
  assert.match(completion, /onConversionCompleted=\{\(\) => \{ void onQuotationRefreshed\(\); \}\}/);
  assert.match(completion, /getLatestCustomQuotationVersion\(quotation\.id\)/);
});

test('la orden existente se toma de la versión persistida y no de estado optimista', () => {
  assert.match(api, /salesOrder: \{ id: string; orderNumber: string \| null \} \| null/);
  assert.match(completion, /version\.salesOrder\.orderNumber/);
  assert.match(completion, /Orden de venta creada/);
  assert.match(completion, /await materializeCustomQuotationSalesOrder\(quotation\.id, version\.versionId\)/);
  assert.match(completion, /const persistedVersion = await getLatestCustomQuotationVersion\(quotation\.id\)/);
  assert.match(completion, /if \(!persistedVersion\.salesOrder\)/);
  assert.match(completion, /disabled=\{materializing\}/);
  assert.match(completion, /Creando orden de venta\.\.\./);
});

test('los controles se limitan al workspace interno y no exponen billing ni datos internos', () => {
  assert.match(completion, /if \(!isAccepted\) return null/);
  assert.doesNotMatch(publicApproval, /SalesOrder|orden de venta|sales-order/i);
  assert.doesNotMatch(`${api}\n${completion}`, /billing-api|account-receivable|authoritativeCostAmount|PricingConfiguration|TenantPricingPolicy|riskMarginPercent|salesCommissionPercent|bankCommissionPercent|agencyProfit|CABYS|UoM|taxCode|taxRate/i);
});
