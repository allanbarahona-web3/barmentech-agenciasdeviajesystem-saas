import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = () => read('../src/components/operations/operational-unified-workspace.tsx');

test('Operación defaults to passenger navigation and keeps group and global modes local', () => {
  const text = source();
  assert.match(text, /useState<Mode>\('passenger'\)/);
  for (const label of ['Por pasajero', 'Por grupo', 'Todos los trabajos']) assert.match(text, new RegExp(label));
  assert.match(text, /OperationalRequirementsWorkspace/);
});

test('Passenger workspace uses bounded roster and participant-filtered work without per-card detail reads', () => {
  const text = source();
  assert.match(text, /getOperationalPassengerRoster\(travelPackageId, 1, search/);
  assert.match(text, /participantId: selectedPassengerId/);
  assert.match(text, /Selecciona un pasajero para revisar su trabajo operativo/);
  assert.match(text, /Este pasajero no tiene trabajo operativo pendiente/);
  assert.doesNotMatch(text, /getOperationalRequirement\(/);
  assert.doesNotMatch(text, /createOperationalRequirement|Agregar necesidad/);
});

test('Passenger work and management preserve shared Requirement execution context', () => {
  const text = source();
  for (const label of ['Aplica a {item.passengers.total} pasajeros', 'Cobertura general:', 'Estado del pasajero:', 'Gestionar']) assert.match(text, new RegExp(label));
  assert.match(text, /participantCoverageStatus/);
  assert.match(text, /OperationalFulfillmentsWorkspace/);
  assert.match(text, /requirementId=\{managed.id\}/);
  assert.doesNotMatch(text, /createOperationalPurchase|participantId.*purchase/);
});

test('Group workspace uses active group context and one group-filtered work request', () => {
  const text = source();
  assert.match(text, /group.status === 'ACTIVE'/);
  assert.match(text, /passengerGroupId: selectedGroupId/);
  assert.match(text, /group.members.map/);
  assert.match(text, /Este grupo no tiene trabajo operativo pendiente/);
  assert.match(text, /setMode\('passenger'\)/);
  assert.doesNotMatch(text, /addPassengerGroupMembers|updatePassengerGroup|archivePassengerGroup/);
});

test('All-work reuses workspace-owned groups and bounded roster instead of making auxiliary readers', () => {
  const text = source();
  assert.match(text, /<OperationalRequirementsWorkspace travelPackageId=\{travelPackageId\} groups=\{groups\} passengerOptions=\{roster\.map/);
  assert.match(text, /const \[allVisited, setAllVisited\] = useState\(false\)/);
  assert.match(text, /allVisited \? <div hidden=\{mode !== 'all'\}>/);
  assert.match(text, /const selectMode = \(next: Mode\) => \{ if \(next === 'all'\) setAllVisited\(true\); if \(next !== 'passenger'\) ensureGroupDirectory\(\); setMode\(next\); \}/);
});

test('Unified workspace retains semantic commercial context and no operational assignee UI', () => {
  const text = source();
  assert.match(text, /Contexto comercial/);
  assert.match(text, /service.presentation.title/);
  assert.doesNotMatch(text, /Responsable|assignedTo|Finance|Finanzas/);
});
