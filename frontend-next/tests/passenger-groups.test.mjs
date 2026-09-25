import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  isPassengerGroupableServiceCode,
  membershipDelta,
} from '../src/lib/passenger-groups.ts';

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('keeps the approved service-purpose subset local to Passenger Groups', () => {
  for (const code of [
    'LODGING',
    'FLIGHT_TICKET',
    'TRANSPORTATION',
    'TOUR',
    'EVENT_TICKET',
    'SEAT_SELECTION',
    'BAGGAGE',
    'INSURANCE',
  ]) {
    assert.equal(isPassengerGroupableServiceCode(code), true);
  }
  assert.equal(isPassengerGroupableServiceCode('VISA_ASSISTANCE'), false);
});

test('calculates batch membership changes without treating another group as exclusive', () => {
  assert.deepEqual(
    membershipDelta(['participant-a', 'participant-b'], ['participant-b', 'participant-c', 'participant-c']),
    { toAdd: ['participant-c'], toRemove: ['participant-a'] },
  );
});

test('uses the existing catalog label and ID, keeping technical codes out of the form', () => {
  const source = readSource('../src/components/passenger-groups/passenger-groups-workspace.tsx');

  assert.match(source, /getSelectableAdditionalServices/);
  assert.match(source, /isPassengerGroupableServiceCode\(item\.code\)/);
  assert.match(source, /value=\{item\.id\}>\{item\.name\}/);
  assert.doesNotMatch(source, /Hospedaje|Boletos aéreos|Selección de asiento/);
});

test('renders the required G3 states and uses the batch membership API', () => {
  const workspace = readSource('../src/components/passenger-groups/passenger-groups-workspace.tsx');
  const api = readSource('../src/lib/passenger-groups-api.ts');

  assert.match(workspace, /No hay grupos creados para este viaje\./);
  assert.match(workspace, /Este viaje todavía no tiene pasajeros disponibles\./);
  assert.match(workspace, /assigningGroup !== null/);
  assert.match(workspace, /membershipDelta\(/);
  assert.match(workspace, /addPassengerGroupMembers\(travelPackageId, assigningGroup\.id, toAdd\)/);
  assert.match(workspace, /removePassengerGroupMembers\(travelPackageId, assigningGroup\.id, toRemove\)/);
  assert.doesNotMatch(workspace, /Promise\.all\(.*participant/i);
  assert.match(api, /'DELETE', \{\n    participantIds,/);
  assert.match(api, /\/passenger-groups/);
});

test('keeps archived groups read-only in the basic UI', () => {
  const source = readSource('../src/components/passenger-groups/passenger-groups-workspace.tsx');

  assert.match(source, /group\.status === 'ARCHIVED'/);
  assert.match(source, /archived \? <Badge variant="outline">Archivado<\/Badge> : null/);
  assert.match(source, /!archived && onEdit && onAssign && onArchive/);
  assert.match(source, /Los pasajeros y el historial actual se conservarán\./);
});
