import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const workspace = () => read('../src/components/operations/operational-requirements-workspace.tsx');
const api = () => read('../src/lib/operations-api.ts');

test('Trabajo operativo is a server-paginated commercial execution queue', () => {
  const source = workspace();
  for (const text of ['Trabajo operativo', 'Necesidad operativa', 'Por gestionar', 'En gestión', 'Completado', 'Cancelado', 'No aplica', 'Gestionar']) assert.match(source, new RegExp(text));
  assert.match(source, /listOperationalWorkItems\(travelPackageId/);
  assert.match(api(), /pageSize: '20'/);
  assert.doesNotMatch(source, /createOperationalRequirement|updateOperationalRequirement|Agregar necesidad|Nuevo requerimiento|sourceType/);
});
test('queue cards retain commercial execution context without an Operations assignee', () => {
  const source = workspace();
  for (const text of ['Grupo origen:', 'Cobertura:', 'Compra habilitada', 'Compra bloqueada', 'Información financiera no disponible', 'Sin gestión iniciada']) assert.match(source, new RegExp(text));
  assert.match(source, /soldContext\.scope === 'EXACT_SERVICE_LINE'/);
  assert.doesNotMatch(source, /Responsable|assignedTo/);
  assert.doesNotMatch(source, /listOperationalFulfillments\(.*item|listOperationalPurchases\(.*item|listOperationalEvidence\(.*item/);
});
test('work-item cards expose only management/detail actions, never Requirement completion or cancellation controls', () => {
  const source = workspace();
  assert.match(source, /Gestionar/);
  assert.match(source, /Ver detalle/);
  assert.doesNotMatch(source, /Marcar completado|Cancelar necesidad|transitionOperationalRequirement|onMove|onCancel/);
});
test('empty queue explains that approved commercial services supply operations work', () => {
  const source = workspace();
  assert.match(source, /Los servicios aprobados desde Contratos, Servicios adicionales o Cotizaciones personalizadas aparecerán aquí/);
  assert.match(source, /Ver pasajeros/);
  assert.doesNotMatch(source, /necesidad extraordinaria|Agregar necesidad/);
});
test('queue filters remain server-side without the assignee filter', () => {
  const source = workspace();
  for (const value of ['passengerGroupId: groupId \\|\\| undefined', 'participantId: participantId \\|\\| undefined', 'deadlineState: deadlineState \\|\\| undefined', 'Todos los grupos', 'Buscar pasajero', 'Próximas a vencer']) assert.match(source, new RegExp(value));
  assert.doesNotMatch(source, /assignedToUserId|unassigned|Todos los responsables|Sin responsable|listTenantUsers/);
  assert.doesNotMatch(source, /needs\.filter\(|data\?\.items\.filter\(/);
});
