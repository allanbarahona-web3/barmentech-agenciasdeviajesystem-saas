import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = () => read('../src/components/operations/operational-unified-workspace.tsx');
const api = () => read('../src/lib/operations-api.ts');
const fulfillmentWorkspace = () => read('../src/components/operations/operational-fulfillments-workspace.tsx');

test('Operations uses one passenger-dashboard reader rather than legacy passenger, group, and all-work navigation', () => {
  const text = source();
  assert.match(text, /getOperationalPassengerDashboard\(travelPackageId/);
  assert.doesNotMatch(text, /getOperationalPassengerRoster|getOperationalPassengerOverview|OperationalRequirementsWorkspace/);
  for (const label of ['Por pasajero', 'Por grupo', 'Todos los trabajos']) assert.doesNotMatch(text, new RegExp(label));
  assert.match(text, /aria-label="Operaciones por pasajero"/);
});

test('dashboard has paginated server filters, debounced search, and stale-response protection', () => {
  const text = source();
  assert.match(text, /window\.setTimeout\([^]*350\)/);
  assert.match(text, /trimmed\.length < 2/);
  assert.match(text, /setSearch\(''\); setPage\(1\)/);
  assert.match(text, /requestId\.current/);
  assert.match(text, /contractId: contractId \?\? undefined/);
  assert.match(text, /passengerGroupId: passengerGroupId \?\? undefined/);
  assert.match(text, /source, status/);
  assert.match(text, /pagination\.totalPages/);
  assert.match(api(), /passenger-dashboard\?\$\{params\.toString\(\)\}/);
});

test('each passenger is collapsed by default, may be expanded locally, and exposes lightweight identity', () => {
  const text = source();
  assert.match(text, /useState<Set<string>>\(\(\) => new Set\(\)\)/);
  assert.match(text, /aria-expanded=\{open\}/);
  assert.match(text, /toggleExpanded/);
  assert.match(text, /participant\.identification/);
  assert.match(text, /<RoleIcon role=\{participant\.role\}/);
  assert.match(text, /Crown,.*UserRound,.*Baby/);
  assert.match(text, /onToggle=\{\(\) => toggleExpanded\(item\.participant\.travelPackageParticipantId\)\}/);
});

test('contract tags live on passenger rows, reuse Additional Services semantics, and combine with group filters', () => {
  const text = source();
  assert.match(text, /buildAdditionalServicesContractTagClasses/);
  assert.match(text, /additionalServicesContractTagKey/);
  assert.match(text, /onContract\(contract\.contractId\)/);
  assert.match(text, /onGroup\(group\.id\)/);
  assert.match(text, /Contrato: \$\{activeContract\.contractNumber\}/);
  assert.match(text, /Grupo: \$\{activeGroup\.name\}/);
  assert.match(text, /current === nextContractId \? null : nextContractId/);
  assert.match(text, /current !== nextGroupId \? nextGroupId : null/);
  assert.doesNotMatch(text, /aria-label="Filtrar por contrato"/);
});

test('expanded requirements use source and execution labels without raw source codes and enter preserved management', () => {
  const text = source();
  assert.match(text, /requirement\.sourceLabel/);
  assert.match(text, /Contrato base/);
  assert.match(text, /Compartido con \{requirement\.sharedPassengerCount\} pasajeros/);
  assert.match(text, /Reserva:.*Compra:.*Confirmación:/);
  assert.match(text, /setManaged\(\{ requirement, participantId: item\.participant\.travelPackageParticipantId \}\)/);
  assert.match(text, /<OperationalFulfillmentsWorkspace/);
  assert.match(text, /participantScope=\{managed\.participantId\}/);
  assert.match(fulfillmentWorkspace(), /scopedUncoveredParticipantIds/);
  assert.match(fulfillmentWorkspace(), /!participantScope \? <PassengerChooser/);
  assert.doesNotMatch(text, /OperationalPurchaseDrawer|createOperationalPurchase/);
});

test('passenger rows show trip age and group badges before expansion, while documents remain explicit and lazy', () => {
  const text = source();
  const context = read('../src/components/operations/passenger-operational-context.tsx');
  assert.match(text, /participant\.ageAtTrip !== null/);
  assert.match(text, /\$\{participant\.ageAtTrip\} años/);
  assert.match(text, /item\.passengerGroups\.map/);
  assert.match(text, /<PassengerDocumentsAction requirementId=\{documentRequirement\.requirementId\}/);
  assert.match(text, /participantContextKey=\{`passenger:\$\{participant\.travelPackageParticipantId\}`\}/);
  assert.match(context, /participantContextKey && documentGroups \? documentGroups\.filter/);
  assert.match(context, /await listOperationalPassengerDocuments\(requirementId\)/);
  assert.doesNotMatch(context, /useEffect\(/);
  assert.doesNotMatch(text, /calculateAge|dateOfBirth/);
});
