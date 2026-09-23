import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const detail = source('../src/app/custom-quotations/[id]/page.tsx');
const quotation = source('../src/features/custom-quotations/components/CustomQuotationProposalTab.tsx');
const api = source('../src/lib/custom-quotations-api.ts');

test('el workspace reduce la navegación a Detalle, Costos y Cotización', () => {
  assert.match(detail, /type WorkspaceTab = 'DETAIL' \| 'COSTS' \| 'QUOTE'/);
  assert.match(detail, />Detalle<\/Button>/);
  assert.match(detail, />Costos<\/Button>/);
  assert.match(detail, />Cotización<\/Button>/);
  assert.doesNotMatch(detail, /activeTab === 'PRICE'|activeTab === 'PROPOSAL'|>Precio<\/Button>|>Propuesta<\/Button>/);
});

test('Cotización conserva la autoridad de precios y emisión sin exponer internals', () => {
  assert.match(quotation, /calculateCustomQuotationPricing\(quotation\.id\)/);
  assert.match(quotation, /getCustomQuotationPricing\(quotation\.id\)/);
  assert.match(quotation, /<SectionCard title="Precio">/);
  assert.match(quotation, /Estado del precio/);
  assert.match(quotation, /Emitir cotización/);
  assert.doesNotMatch(quotation, /Precio comercial|riskMarginPercent|salesCommissionPercent|bankCommissionPercent|agencyProfit|PricingConfiguration/);
  assert.doesNotMatch(api, /calculateCustomQuotationPricing[\s\S]{0,180}(tenantId|riskMargin|commission|finalSellingPrice)/);
});

test('los servicios mantienen los campos comerciales del servidor en tarjetas jerárquicas', () => {
  assert.match(quotation, /commercialLines\.map/);
  assert.match(quotation, /<p className="font-medium">\{line\.description\}<\/p>/);
  assert.match(quotation, /ProposalField label="Cantidad" value=\{line\.quantity\}/);
  assert.match(quotation, /ProposalField label="Detalle" value=\{line\.commercialNote\}/);
  assert.doesNotMatch(quotation, /detailPayload|costSupplier|authoritativeTotalCost|sourceUrl|evidence/);
});

test('la misma Cotización conserva la versión inmutable, PDF y entrega posterior a emisión', () => {
  assert.match(quotation, /getLatestCustomQuotationVersion\(quotation\.id\)/);
  assert.match(quotation, /generateCustomQuotationProposal\(quotation\.id, version\.versionId\)/);
  assert.match(quotation, /sendCustomQuotationProposal\(quotation\.id, version\.versionId\)/);
  assert.match(quotation, /version\.recipientFullName/);
  assert.match(quotation, /version\.lines\.map/);
});
