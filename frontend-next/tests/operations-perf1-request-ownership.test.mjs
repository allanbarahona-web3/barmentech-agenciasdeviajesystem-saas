import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const shell = () => read('../src/components/operations/operations-trip-shell.tsx');
const workspace = () => read('../src/components/operations/operational-unified-workspace.tsx');
const queue = () => read('../src/components/operations/operational-requirements-workspace.tsx');

test('selected-trip header owns the standalone lightweight context request', () => {
  const source = shell();
  assert.match(source, /getTravelPackageById/);
  assert.doesNotMatch(source, /getOperationalPassengerOverview|listPassengerGroups|listOperationalWorkItems/);
  assert.match(source, /aria-busy="true"/);
});

test('all-work has no independent passenger-overview or group-directory request', () => {
  const source = queue();
  assert.match(source, /groups: PassengerGroup\[\]; passengerOptions: RosterPassenger\[\]/);
  assert.doesNotMatch(source, /getOperationalPassengerOverview|listPassengerGroups/);
  assert.match(source, /passengerOptions\.filter/);
});

test('unified workspace owns shared roster and active groups once and lazily mounts all-work', () => {
  const source = workspace();
  assert.equal((source.match(/listPassengerGroups\(travelPackageId\)/g) ?? []).length, 1);
  assert.match(source, /getOperationalPassengerRoster\(travelPackageId, 1, search/);
  assert.match(source, /allVisited/);
});
