import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../src/app/custom-quotation-approval/[token]/page.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/custom-quotation-public-approval-api.ts', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../src/components/vertical-nav.tsx', import.meta.url), 'utf8');

test('la ruta pública carga una propuesta inmutable únicamente por token', () => {
  assert.match(api, /publicApprovalPath\(token\)/);
  assert.match(api, /\/public\/custom-quotation-approval\/\$\{encodeURIComponent\(token\)\}/);
  assert.match(page, /getPublicCustomQuotationApproval\(token\)/);
  assert.match(page, /proposal\.title/);
  assert.match(page, /proposal\.recipientFullName/);
  assert.match(page, /proposal\.lines\.map/);
  assert.match(page, /formatFinanceMoneyDisplay\(proposal\.finalSellingPrice, proposal\.currency\)/);
  assert.match(page, /exactValue=\{proposal\.finalSellingPrice\}/);
  assert.doesNotMatch(api, /fetchApi|authenticatedFetch|getStoredToken|Authorization/);
  assert.doesNotMatch(page, /tenantId|quotationId|versionId|customerId|leadId/);
});

test('la página pública muestra propuesta firmada y confirma decisiones terminales', () => {
  assert.match(page, /href=\{proposal\.document\.url\} target="_blank" rel="noreferrer"/);
  assert.match(page, /Ver propuesta/);
  assert.match(page, /Aceptar cotización/);
  assert.match(page, /Rechazar cotización/);
  assert.match(page, /¿Deseas aceptar esta cotización\?/);
  assert.match(page, /¿Deseas rechazar esta cotización\?/);
  assert.match(page, /acceptPublicCustomQuotation\(token\)/);
  assert.match(page, /rejectPublicCustomQuotation\(token\)/);
  assert.match(api, /\$\{publicApprovalPath\(token\)\}\/accept/, 'el POST de aceptación usa sólo el token');
  assert.match(api, /\$\{publicApprovalPath\(token\)\}\/reject/, 'el POST de rechazo usa sólo el token');
  assert.match(page, /disabled=\{acting\}/);
  assert.match(page, /Procesando\.\.\./);
});

test('los estados terminales y enlaces inválidos son seguros y no exponen información interna', () => {
  for (const label of ['Aceptada', 'Rechazada', 'Esta cotización ha vencido.', 'Esta cotización ya no está disponible.', 'Este enlace ha vencido o ya no está disponible.']) {
    assert.match(page, new RegExp(label.replace(/[.?]/g, '\\$&')));
  }
  assert.match(nav, /pathname\.startsWith\("\/custom-quotation-approval"\)/);
  assert.doesNotMatch(`${page}\n${api}`, /authoritativeCostAmount|operationalCostsAmount|PricingConfiguration|TenantPricingPolicy|riskMarginPercent|salesCommissionPercent|bankCommissionPercent|agencyProfit|CABYS|UoM|taxCode|taxRate/i);
  assert.doesNotMatch(page, /VerticalNav|PricingWorkspace|CostWorkspace|SalesOrder/);
});
