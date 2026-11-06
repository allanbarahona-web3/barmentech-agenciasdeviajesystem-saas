import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const shell = () => read('../src/components/operations/operations-trip-shell.tsx');
const workspace = () => read('../src/components/operations/operational-unified-workspace.tsx');

test('selected-trip header owns the standalone lightweight context request', () => {
  const source = shell();
  assert.match(source, /getTravelPackageById/);
  assert.doesNotMatch(source, /getOperationalPassengerOverview|listPassengerGroups|listOperationalWorkItems/);
  assert.match(source, /aria-busy="true"/);
});

test('unified workspace owns one passenger dashboard request with no client-side auxiliary readers', () => {
  const source = workspace();
  assert.match(source, /getOperationalPassengerDashboard\(travelPackageId/);
  assert.doesNotMatch(source, /listPassengerGroups\(travelPackageId\)|getOperationalPassengerRoster|getOperationalPassengerOverview|listOperationalWorkItems/);
  assert.match(source, /requestId\.current/);
});
