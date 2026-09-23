import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const detail = readSource('../src/app/custom-quotations/[id]/page.tsx');
const quotationApi = readSource('../src/lib/custom-quotations-api.ts');
const composition = readSource('../src/features/cost-engine/generic-cost-composition.tsx');
const costApi = readSource('../src/lib/cost-engine-api.ts');

test('el detalle usa únicamente líneas comerciales derivadas y dirige la composición a Costos', () => {
  assert.match(quotationApi, /getCustomQuotationCommercialLines/);
  assert.match(quotationApi, /\/commercial-lines/);
  assert.match(detail, /Servicios cotizados/);
  assert.match(detail, /No hay servicios agregados a esta cotización/);
  assert.match(detail, /Agrega los servicios desde la sección de Costos/);
  assert.match(detail, /Ir a Costos/);
  assert.doesNotMatch(detail, /addCustomQuotationLine|updateCustomQuotationLine|removeCustomQuotationLine|reorderCustomQuotationLines/);
  assert.doesNotMatch(quotationApi, /\/custom-quotations\/\$\{encodeURIComponent\(id\)\}\/lines/);
});

test('la cotización inyecta el adaptador scoped sin convertir costingProjectId en autoridad de ruta', () => {
  assert.match(quotationApi, /createCustomQuotationCostEngineApi/);
  assert.match(quotationApi, /\/custom-quotations\/\$\{encodeURIComponent\(quotationId\)\}\/cost-engine/);
  assert.match(quotationApi, /createComponent: \(_costingProjectId, input\) => apiPost<CostComponent>\(`\$\{scope\}\/components`, input\)/);
  assert.match(detail, /api=\{scopedCostApi\}/);
  assert.match(detail, /onCompositionChanged=\{handleCompositionChanged\}/);
  assert.match(composition, /api\?: CostCompositionApiAdapter/);
  assert.match(composition, /api = defaultCostCompositionApi/);
  assert.match(costApi, /defaultCostCompositionApi/);
});

test('la propuesta de borrador se basa en servicios estructurados y no en líneas raíz mutables', () => {
  const proposal = readSource('../src/features/custom-quotations/components/CustomQuotationProposalTab.tsx');
  assert.match(proposal, /commercialLines: CustomQuotationCommercialLine\[\]/);
  assert.match(proposal, /const noLines = commercialLines\.length === 0/);
  assert.match(proposal, /commercialLines\.map/);
  assert.doesNotMatch(proposal, /quotation\.lines/);
});
