import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const workspace = () => read('../src/components/operations/operational-unified-workspace.tsx');
const api = () => read('../src/lib/operations-api.ts');

test('passenger mode uses the dedicated bounded roster endpoint with no legacy overview request', () => {
  const source = workspace();
  assert.match(source, /getOperationalPassengerRoster\(travelPackageId, 1, search \|\| undefined\)/);
  assert.doesNotMatch(source, /getOperationalPassengerOverview|financeEligibility|missingItems|passenger\.requirements/);
  assert.match(api(), /passenger-roster\?\$\{params\.toString\(\)\}/);
  assert.match(api(), /pageSize: '20'/);
});

test('commercial context is requested only by expansion and reuses participant-local workspace data', () => {
  const source = workspace();
  assert.match(source, /<PassengerCommercialContext participantId=/);
  assert.match(source, /open=\{open\} onToggle=\{toggle\}/);
  assert.match(source, /commercialContextByParticipant/);
  assert.match(source, /commercialRequests\.current\.get\(participantId\)/);
  assert.match(source, /getOperationalPassengerCommercialContext\(travelPackageId, participantId\)/);
});

test('group directory is deferred until a group or all-work view needs it', () => {
  const source = workspace();
  assert.match(source, /groupDirectoryNeededFor !== travelPackageId/);
  assert.match(source, /if \(next !== 'passenger'\) ensureGroupDirectory\(\)/);
  assert.match(source, /ensureGroupDirectory\(\); setSelectedGroupId\(id\); setMode\('group'\)/);
});
