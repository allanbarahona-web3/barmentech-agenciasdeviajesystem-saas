import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const workspace = () => read('../src/components/operations/standalone-operational-requirements-workspace.tsx');
const api = () => read('../src/lib/operations-api.ts');

test('standalone Operations navigation and route remain separate from travel workspaces', () => {
  const nav = read('../src/components/vertical-nav.tsx');
  const landing = read('../src/components/operations/operations-landing.tsx');
  const route = read('../src/app/operations/standalone/page.tsx');
  assert.match(nav, /href: "\/operations\/standalone", label: "Solicitudes independientes"/);
  assert.match(landing, /Solicitudes independientes/);
  assert.match(landing, /\/operations\/standalone/);
  assert.match(route, /OperationsAccessGate/);
  assert.match(route, /StandaloneOperationalRequirementsWorkspace/);
});

test('standalone queue uses the generic scope API and humanizes the Custom Quotation source', () => {
  const text = workspace();
  assert.match(text, /listStandaloneOperationalRequirements/);
  assert.match(text, /getStandaloneOperationalRequirement/);
  assert.match(text, /CUSTOM_QUOTATION_LINE/);
  assert.match(text, /Cotización personalizada/);
  assert.match(text, /item\.customer\.fullName/);
  assert.match(text, /item\.description/);
  assert.match(api(), /scopeType: 'STANDALONE_CUSTOMER'/);
  assert.doesNotMatch(text, /TripContextHeader|PassengerMatrix|Roster|destination|travelPackageParticipant/);
});

test('standalone fulfillment, purchase, and evidence use standalone endpoints without passenger calls', () => {
  const text = workspace();
  const apiText = api();
  for (const name of ['createStandaloneOperationalFulfillment', 'createStandaloneOperationalPurchase', 'uploadStandaloneOperationalEvidence', 'getStandaloneOperationalEvidenceAccess']) assert.match(text, new RegExp(name));
  assert.match(text, /La compra permanece bloqueada hasta que Finanzas la autorice/);
  assert.doesNotMatch(text, /participantIds|addOperationalFulfillmentPassengers|removeOperationalFulfillmentPassengers/);
  assert.match(apiText, /\/operations\/standalone\/requirements/);
  assert.match(apiText, /function standaloneFulfillmentsPath/);
  assert.match(apiText, /function standalonePurchasesPath/);
  assert.match(apiText, /function standaloneEvidencePath/);
});
