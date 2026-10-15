import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const workspace = () => read('../src/components/operations/operational-unified-workspace.tsx');
const api = () => read('../src/lib/operations-api.ts');

test('passenger dashboard uses one page reader and does not fetch on accordion expansion', () => {
  const source = workspace();
  assert.match(source, /getOperationalPassengerDashboard\(travelPackageId/);
  assert.match(source, /pageSize: 20/);
  assert.match(source, /toggleExpanded/);
  assert.doesNotMatch(source, /getOperationalPassengerRoster|getOperationalPassengerOverview|getOperationalPassengerCommercialContext/);
  assert.match(api(), /passenger-dashboard\?\$\{params\.toString\(\)\}/);
});

test('contract, group, source, and status are supplied to the same bounded dashboard request', () => {
  const source = workspace();
  assert.match(source, /contractId: contractId \?\? undefined/);
  assert.match(source, /passengerGroupId: passengerGroupId \?\? undefined/);
  assert.match(source, /source, status/);
  assert.doesNotMatch(source, /listPassengerGroups\(|listOperationalWorkItems\(/);
});
