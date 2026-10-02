import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
test('Passenger navigation uses the lightweight roster without manual-demand controls', () => {
  const source = read('../src/components/operations/operational-unified-workspace.tsx');
  for (const text of ['Pasajeros', 'Grupo:', 'Trabajo operativo', 'Avance', 'Contexto comercial']) assert.match(source, new RegExp(text));
  assert.doesNotMatch(source, /Agregar necesidad|Selecciona uno o más pasajeros|selectedPassengerIds|checkbox/);
  assert.doesNotMatch(source, /<TableHead>Finanzas<\/TableHead>|Notas operativas/);
  assert.doesNotMatch(source, /getOperationalPassengerOverview|operationalNotes|missingItems|financeEligibility|passenger\.requirements/);
});
test('Passenger group filtering remains server-paginated and participant identity stays available', () => {
  const source = read('../src/components/operations/operational-unified-workspace.tsx');
  assert.match(source, /listPassengerGroups\(travelPackageId\)/);
  assert.match(source, /getOperationalPassengerRoster\(travelPackageId, 1, search/);
  assert.match(source, /passengerGroupId: selectedGroupId/);
  assert.match(source, /travelPackageParticipantId/);
  assert.doesNotMatch(source, /filter\(.*passenger.*group/i);
});
test('Additional Services remain compact, semantic, and lazy per selected passenger', () => {
  const source = read('../src/components/operations/operational-unified-workspace.tsx');
  assert.match(source, /getOperationalPassengerCommercialContext\(travelPackageId, participantId\)/);
  assert.match(source, /commercialRequests = useRef/);
  assert.match(source, /onToggle=\{toggle\}/);
  assert.match(source, /service\.presentation\.title/);
  assert.doesNotMatch(source, /JSON\.stringify|Object\.entries\(service|getOperationsReadiness|listOperationalPurchases|listOperationalEvidence/);
});
