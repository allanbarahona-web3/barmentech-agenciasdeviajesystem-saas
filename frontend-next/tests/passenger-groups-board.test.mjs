import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ALL_PASSENGER_GROUP_SERVICES,
  buildPassengerGroupsBoard,
  shouldAddPassengerGroupMember,
} from '../src/lib/passenger-groups-board.ts';

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const participants = [
  { id: 'a', clientId: 'client-a', role: 'HOLDER', client: { fullName: 'Allan' } },
  { id: 'b', clientId: 'client-b', role: 'COMPANION', client: { fullName: 'María' } },
  { id: 'c', clientId: 'client-c', role: 'COMPANION', client: { fullName: 'Carlos' } },
];

const group = (id, serviceCode, status, memberIds) => ({
  id,
  travelPackageId: 'trip-1',
  additionalServiceCatalogId: `catalog-${serviceCode}`,
  serviceCode,
  serviceName: serviceCode,
  name: id,
  color: null,
  notes: null,
  status,
  createdAt: '',
  updatedAt: '',
  members: memberIds.map((travelPackageParticipantId) => ({ travelPackageParticipantId, clientId: `client-${travelPackageParticipantId}`, fullName: travelPackageParticipantId })),
});

test('selected service board filters active groups and calculates unassigned only for that service', () => {
  const board = buildPassengerGroupsBoard([
    group('lodging-1', 'LODGING', 'ACTIVE', ['a']),
    group('transport-1', 'TRANSPORTATION', 'ACTIVE', ['b']),
    group('lodging-archived', 'LODGING', 'ARCHIVED', ['c']),
  ], participants, 'LODGING');

  assert.deepEqual(board.groups.map((item) => item.id), ['lodging-1']);
  assert.deepEqual(board.sourceParticipants.map((participant) => participant.id), ['b', 'c']);
});

test('Todos los servicios keeps the complete roster source and shows every active group', () => {
  const board = buildPassengerGroupsBoard([
    group('lodging-1', 'LODGING', 'ACTIVE', ['a']),
    group('transport-1', 'TRANSPORTATION', 'ACTIVE', ['a', 'b']),
    group('archived-1', 'BAGGAGE', 'ARCHIVED', ['c']),
  ], participants, ALL_PASSENGER_GROUP_SERVICES);

  assert.deepEqual(board.groups.map((item) => item.id), ['lodging-1', 'transport-1']);
  assert.deepEqual(board.sourceParticipants.map((participant) => participant.id), ['a', 'b', 'c']);
  assert.equal(board.isAllServices, true);
});

test('Todos los servicios roster remains complete after a destination membership changes', () => {
  const before = buildPassengerGroupsBoard([
    group('lodging-1', 'LODGING', 'ACTIVE', ['a']),
  ], participants, ALL_PASSENGER_GROUP_SERVICES);
  const after = buildPassengerGroupsBoard([
    group('lodging-1', 'LODGING', 'ACTIVE', ['a', 'b']),
  ], participants, ALL_PASSENGER_GROUP_SERVICES);

  assert.deepEqual(before.sourceParticipants.map((participant) => participant.id), ['a', 'b', 'c']);
  assert.deepEqual(after.sourceParticipants.map((participant) => participant.id), ['a', 'b', 'c']);
});

test('destination membership check avoids duplicate writes without changing any source membership', () => {
  const memberIds = new Set(['a']);

  assert.equal(shouldAddPassengerGroupMember(memberIds, 'a'), false);
  assert.equal(shouldAddPassengerGroupMember(memberIds, 'b'), true);
  assert.deepEqual([...memberIds], ['a']);
});

test('board uses one batch API mutation per add or explicit removal and keeps the checklist fallback', () => {
  const workspace = readSource('../src/components/passenger-groups/passenger-groups-workspace.tsx');
  const board = readSource('../src/components/passenger-groups/passenger-groups-board.tsx');

  assert.match(workspace, /addPassengerGroupMembers\(travelPackageId, group\.id, \[participantId\]\)/);
  assert.match(workspace, /removePassengerGroupMembers\(travelPackageId, group\.id, \[participantId\]\)/);
  assert.match(workspace, /membershipDelta\(/);
  assert.match(workspace, /Asignar pasajeros/);
  assert.match(workspace, /Todos los servicios/);
  assert.match(workspace, /useState\(ALL_PASSENGER_GROUP_SERVICES\)/);
  assert.match(board, /Pasajeros del viaje/);
  assert.match(board, /DndContext/);
  assert.match(board, /onAddParticipant\(destination, participantId\)/);
  assert.match(board, /never removes/);
  assert.match(board, /onRemoveParticipant\(group, member\.travelPackageParticipantId\)/);
  assert.doesNotMatch(board, /listPassengerGroups|getTravelPackageParticipants|fetchApi/);
});

test('the active board intentionally omits archived groups', () => {
  const board = readSource('../src/lib/passenger-groups-board.ts');

  assert.match(board, /group\.status !== 'ACTIVE'/);
});
