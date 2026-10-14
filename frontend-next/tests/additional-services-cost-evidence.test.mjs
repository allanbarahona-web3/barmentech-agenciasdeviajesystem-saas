import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const evidence = readFileSync(
  new URL('../src/lib/additional-services-cost-evidence.ts', import.meta.url),
  'utf8',
);
const store = readFileSync(
  new URL('../src/lib/additional-services-temporary-store.ts', import.meta.url),
  'utf8',
);
const linesTable = readFileSync(
  new URL('../src/components/additional-services-lines-table.tsx', import.meta.url),
  'utf8',
);
const pricingPage = readFileSync(
  new URL('../src/app/additional-services/pricing/page.tsx', import.meta.url),
  'utf8',
);
const pricingReviewPage = readFileSync(
  new URL('../src/app/additional-services/pricing-review/page.tsx', import.meta.url),
  'utf8',
);
const pricingReview = readFileSync(
  new URL('../src/components/additional-services-pricing-review.tsx', import.meta.url),
  'utf8',
);
const ordersApi = readFileSync(
  new URL('../src/lib/additional-services-orders-api.ts', import.meta.url),
  'utf8',
);
const orderDetail = readFileSync(
  new URL('../src/app/additional-services/orders/[id]/page.tsx', import.meta.url),
  'utf8',
);

test('commercial cost source accepts a URL, an image, or both and explains invalid rows', () => {
  assert.match(evidence, /image\/jpeg/);
  assert.match(evidence, /image\/png/);
  assert.match(evidence, /image\/webp/);
  assert.match(evidence, /10 \* 1024 \* 1024/);
  assert.match(
    evidence,
    /Debe indicar una URL del costo o adjuntar una evidencia\./,
  );
  assert.match(evidence, /url\.protocol !== 'http:' && url\.protocol !== 'https:'/);
  assert.match(pricingPage, /costSourceValidationMessage/);
  assert.match(pricingReviewPage, /costSourceValidationMessage/);
});

test('temporary line keys are stable and evidence is transiently correlated by key', () => {
  assert.match(store, /getTemporaryAdditionalServiceLineId/);
  assert.match(
    store,
    /temporaryLineCostEvidence = new WeakMap<[\s\S]*TemporaryAdditionalServiceLine,[\s\S]*File/,
  );
  assert.match(store, /setTemporaryAdditionalServiceLineCostEvidence/);
  assert.match(pricingReviewPage, /temporaryLineKey = getTemporaryAdditionalServiceLineId\(line\)/);
  assert.match(pricingReviewPage, /temporaryLineKey,/);
});

test('the create request uses deterministic multipart evidence file names', () => {
  assert.match(ordersApi, /const formData = new FormData\(\)/);
  assert.match(ordersApi, /formData\.append\('payload', JSON\.stringify\(input\)\)/);
  assert.match(ordersApi, /`costEvidence\.\$\{temporaryLineKey\}`/);
  assert.match(pricingReviewPage, /evidenceFiles\.push\(\{ temporaryLineKey, file: evidence \}\)/);
});

test('the pricing table provides compact evidence selection, replacement, and removal', () => {
  assert.match(linesTable, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(linesTable, /Reemplazar/);
  assert.match(linesTable, /Quitar/);
  assert.match(linesTable, /Sin evidencia adjunta/);
  assert.match(linesTable, /setTemporaryAdditionalServiceLineCostEvidence\(line, null\)/);
  assert.match(linesTable, /Proveedor[\s\S]{0,900}URL del costo[\s\S]{0,700}Evidencia/);
});

test('cost-source errors appear only after Continue and clear while the row is corrected', () => {
  assert.match(pricingPage, /costSourceValidationAttempt/);
  assert.match(
    pricingPage,
    /setCostSourceValidationAttempt\(\(attempt\) => attempt \+ 1\)/,
  );
  assert.match(linesTable, /const \[showCostSourceError, setShowCostSourceError\] = useState\(false\)/);
  assert.match(linesTable, /if \(!costSourceValidationAttempt\) return/);
  assert.match(linesTable, /setShowCostSourceError\(false\)/);
  assert.match(linesTable, /costSourceError = showCostSourceError/);
  assert.doesNotMatch(linesTable, /costSourceIndicator/);
});

test('the evidence header uses the existing help tooltip with source guidance', () => {
  assert.match(linesTable, /Evidencia[\s\S]{0,250}<HelpTooltip content="Debe indicar una URL del costo o adjuntar una imagen como respaldo\."/);
});

test('the internal review shows safe source status without exposing object keys', () => {
  assert.match(pricingReview, /Origen del costo/);
  assert.match(pricingReview, /costSource/);
  assert.match(orderDetail, /Sin URL registrada/);
  assert.match(orderDetail, /Sin evidencia adjunta/);
  assert.match(orderDetail, /Sin respaldo registrado/);
  assert.match(orderDetail, /costEvidenceOriginalFilename/);
  assert.match(orderDetail, /async function viewCostEvidence/);
  assert.match(orderDetail, /getAdditionalServiceCostEvidenceAccess\(orderId, line\.id\)/);
  assert.doesNotMatch(orderDetail, /costEvidenceObjectKey|objectKey/);
  assert.doesNotMatch(ordersApi, /costEvidenceObjectKey|objectKey/);
});
