import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
test('Passenger dashboard uses one bounded reader without legacy roster controls', () => {
  const source = read('../src/components/operations/operational-unified-workspace.tsx');
  assert.match(source, /getOperationalPassengerDashboard\(travelPackageId, \{ page, pageSize: 20,/);
  for (const text of ['Operaciones por pasajero', 'Buscar pasajero o identificación', 'Filtrar por grupo', 'Filtrar por origen', 'Filtrar por estado']) assert.match(source, new RegExp(text));
  assert.doesNotMatch(source, /Agregar necesidad|Selecciona uno o más pasajeros|selectedPassengerIds|checkbox/);
  assert.doesNotMatch(source, /<TableHead>Finanzas<\/TableHead>/);
  assert.doesNotMatch(source, /getOperationalPassengerOverview|getOperationalPassengerRoster|missingItems|financeEligibility|passenger\.requirements/);
});
test('Passenger group filtering uses dashboard facets and the bounded dashboard request', () => {
  const source = read('../src/components/operations/operational-unified-workspace.tsx');
  assert.match(source, /data\?\.facets\.passengerGroups\.map/);
  assert.match(source, /passengerGroupId: passengerGroupId \?\? undefined/);
  assert.match(source, /const selectGroup = \(nextGroupId: string\).*resetPage\(\)/);
  assert.match(source, /travelPackageParticipantId/);
  assert.doesNotMatch(source, /listPassengerGroups\(travelPackageId\)|getOperationalPassengerRoster/);
  assert.doesNotMatch(source, /filter\(.*passenger.*group/i);
});
