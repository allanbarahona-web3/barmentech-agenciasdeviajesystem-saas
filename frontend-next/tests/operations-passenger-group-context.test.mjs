import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const action = () => read('../src/components/operations/passenger-group-context-action.tsx');
const dashboard = () => read('../src/components/operations/operational-unified-workspace.tsx');
const context = () => read('../src/components/operations/passenger-operational-context.tsx');
const management = () => read('../src/components/operations/operational-fulfillments-workspace.tsx');
const purchaseDrawer = () => read('../src/components/operations/operational-purchase-drawer.tsx');

test('dashboard badges retain their filter action and add a distinct lazy group-context action', () => {
  const source = dashboard();
  assert.match(source, /onClick=\{\(\) => onGroup\(group\.id\)\}/);
  assert.match(source, /<PassengerGroupContextAction travelPackageId=\{travelPackageId\} group=\{group\}/);
  assert.match(source, /<PassengerGroupContextStrip key=\{activeGroup\.id\} travelPackageId=\{travelPackageId\} group=\{activeGroup\}/);
  assert.doesNotMatch(source, /getPassengerGroup\(/);
});

test('one reusable group-context component loads existing group details lazily and caches successful results by trip and group', () => {
  const source = action();
  assert.match(source, /const passengerGroupDetailCache = new Map<string, PassengerGroup>\(\)/);
  assert.match(source, /const passengerGroupDetailLoads = new Map<string, Promise<PassengerGroup>>\(\)/);
  assert.match(source, /return `\$\{travelPackageId\}:\$\{groupId\}`/);
  assert.match(source, /getPassengerGroup\(travelPackageId, groupId\)/);
  assert.match(source, /passengerGroupDetailCache\.set\(key, detail\)/);
  assert.match(source, /if \(cached\) return Promise\.resolve\(cached\)/);
  assert.match(source, /if \(!detail\) void load\(\)/);
});

test('group dialog exposes only operational group context with human labels and friendly empty instruction state', () => {
  const source = action();
  assert.match(source, /Servicio/);
  assert.match(source, /Integrantes/);
  assert.match(source, /Indicación/);
  assert.match(source, /detail\.members\.map/);
  assert.match(source, /member\.fullName/);
  assert.match(source, /Sin indicaciones adicionales\./);
  assert.match(source, /No se pudo cargar la información del grupo\./);
  assert.doesNotMatch(source, /member\.clientId|member\.email|member\.identification|serviceCode.*<\/dd>/);
});

test('one active group filter lazily renders its compact context strip and removes it when no active group exists', () => {
  const source = dashboard();
  const strip = action();
  assert.match(source, /\{activeGroup \? <PassengerGroupContextStrip/);
  assert.match(source, /setPassengerGroupId\(null\); resetPage\(\)/);
  assert.match(strip, /useEffect\(\(\) => \{ if \(!passengerGroupDetailCache\.has\(key\)\) void load\(\); \}, \[key\]\)/);
  assert.match(strip, /detail\.members\.length/);
  assert.match(strip, /detail\.notes\?\.trim\(\) \|\| 'Sin indicaciones adicionales\.'/);
});

test('selected passenger groups propagate only through the locked management path into shared reservation and purchase context', () => {
  const source = dashboard();
  const operationalContext = context();
  const workspace = management();
  const drawer = purchaseDrawer();
  assert.match(source, /passengerGroups: item\.passengerGroups/);
  assert.match(source, /participantGroups=\{managed\.passengerGroups\}/);
  assert.match(workspace, /participantGroups\?: PassengerGroupSummary\[\]/);
  assert.match(workspace, /passengerGroups=\{participantScope \? participantGroups : undefined\}/);
  assert.match(drawer, /passengerGroups\?: PassengerGroupSummary\[\]/);
  assert.match(drawer, /passengerGroups=\{passengerGroups\}/);
  assert.match(operationalContext, /contextParticipantIds\.length === 1 && index === 0 && passengerGroups\?\.length/);
  assert.match(operationalContext, /<PassengerGroupContextAction travelPackageId=\{travelPackageId\} group=\{group\}/);
  assert.doesNotMatch(workspace, /participantScope.*setParticipantScope/);
});
