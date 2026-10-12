import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const fields = () => read('../src/components/operations/operational-service-detail-fields.tsx');
const travel = () => read('../src/components/operations/operational-fulfillments-workspace.tsx');
const standalone = () => read('../src/components/operations/standalone-operational-requirements-workspace.tsx');
const drawer = () => read('../src/components/operations/operational-purchase-drawer.tsx');

test('one shared service-detail component owns all supported purpose fields without source-specific forms', () => {
  const text = fields();
  for (const purpose of ['AIRFARE', 'LODGING', 'TOUR_ACTIVITY', 'TRANSPORTATION']) assert.match(text, new RegExp(`${purpose}: \\[`));
  for (const label of ['Localizador / PNR', 'Nombre del alojamiento', 'Actividad', 'Lugar de recogida']) assert.match(text, new RegExp(label));
  assert.match(text, /CUSTOM_QUOTATION.*GENERIC|Historical CUSTOM_QUOTATION/);
  assert.doesNotMatch(text, /JSON\.stringify\(value/);
});

test('reservation, purchase, and confirmation preserve typed detail through fulfillment APIs', () => {
  const text = travel();
  assert.match(text, /typedOperationalDetail\(detail\.detailPayload, detail\.servicePurposeCode\)/);
  assert.match(text, /detailChanged \? detailPayload : undefined/);
  assert.match(text, /detailPayload: confirmationDetailPayload, detailVersion: 1/);
  assert.match(text, /onUpdateFulfillmentDetails=.*updateOperationalFulfillment/);
  assert.match(drawer(), /serviceDetailsChanged.*onUpdateFulfillmentDetails/s);
  assert.match(drawer(), /detailPayload: enrichedDetails, detailVersion: 1/);
  assert.match(drawer(), /const baseDetails = typedOperationalDetail\(fulfillmentId \? detailPayload : resolvedFulfillment\.detailPayload, servicePurposeCode\)/);
});

test('CQ reuses the shared component and treats historical purposes as generic without passenger controls', () => {
  const text = standalone();
  assert.match(text, /getStandaloneOperationalFulfillment/);
  assert.match(text, /<OperationalServiceDetailFields servicePurposeCode=\{confirmationFulfillment\.servicePurposeCode\}/);
  assert.match(text, /servicePurposeCode=\{requirement\.servicePurposeCode\}/);
  assert.doesNotMatch(text, /participantIds/);
});

test('the active summary exposes generic references and history uses the shared read-only detail view', () => {
  assert.match(travel(), /item\.voucherReference, item\.ticketReference/);
  const history = read('../src/components/operations/operational-travel-history.tsx');
  assert.match(history, /<OperationalServiceDetailFields.*readOnly/s);
  assert.doesNotMatch(history, /JSON\.stringify\(detail\.detailPayload/);
});
