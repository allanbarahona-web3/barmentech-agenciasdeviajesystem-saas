import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  operationalEvidenceTypeLabel,
  operationalPassengerRoleLabel,
  operationalServiceLabel,
  operationalSourceLabel,
  operationalStatusLabel,
} from '../src/lib/operations-presentation.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Operations presentation helpers translate sources, passenger roles, and statuses without exposing enum fallbacks', () => {
  assert.equal(operationalSourceLabel('TRAVEL_PACKAGE_COST_COMPONENT'), 'Contrato base');
  assert.equal(operationalSourceLabel('ADDITIONAL_SERVICE_ORDER_LINE'), 'Servicio adicional');
  assert.equal(operationalSourceLabel('CUSTOM_QUOTATION_LINE'), 'Cotización personalizada');
  assert.equal(operationalSourceLabel('UNKNOWN_SOURCE'), 'Origen no disponible');

  assert.equal(operationalPassengerRoleLabel('HOLDER'), 'Titular');
  assert.equal(operationalPassengerRoleLabel('COMPANION'), 'Acompañante');
  assert.equal(operationalPassengerRoleLabel('MINOR'), 'Menor');
  assert.equal(operationalPassengerRoleLabel('UNKNOWN_ROLE'), 'Pasajero');

  assert.equal(operationalStatusLabel('PENDING'), 'Pendiente');
  assert.equal(operationalStatusLabel('IN_PROGRESS'), 'En gestión');
  assert.equal(operationalStatusLabel('CONFIRMED'), 'Confirmado');
  assert.equal(operationalStatusLabel('FULFILLED'), 'Completado');
  assert.equal(operationalStatusLabel('CANCELLED'), 'Cancelado');
  assert.equal(operationalStatusLabel('REJECTED'), 'Rechazado');
  assert.equal(operationalStatusLabel('UNKNOWN_STATUS'), 'Estado no disponible');
  assert.equal(operationalEvidenceTypeLabel('UNKNOWN_EVIDENCE'), 'Otro documento');
  assert.equal(operationalServiceLabel('Airfare'), 'Boleto aéreo');
  assert.equal(operationalServiceLabel('Generic service'), 'Servicio general');
  assert.equal(operationalServiceLabel('Transportation'), 'Transporte');
});

test('passenger dashboard uses Spanish presentation while retaining original enum values for its API-backed selects', () => {
  const dashboard = read('../src/components/operations/operational-unified-workspace.tsx');
  assert.match(dashboard, /value=\{facet\.value\}>\{operationalSourceLabel\(facet\.value\)\}/);
  assert.match(dashboard, /value=\{facet\}>\{operationalStatusLabel\(facet\)\}/);
  assert.match(dashboard, /setSource\(\(event\.target\.value \|\| undefined\) as OperationalPassengerDashboardSource/);
  assert.match(dashboard, /setStatus\(\(event\.target\.value \|\| undefined\) as OperationalPassengerDashboardStatus/);
  assert.match(dashboard, /operationalSourceLabel\(requirement\.sourceType\)/);
  assert.match(dashboard, /operationalServiceLabel\(requirement\.serviceName\)/);
  assert.match(dashboard, /operationalPassengerRoleLabel\(participant\.role\)/);
  assert.doesNotMatch(dashboard, /sourceLabel\}|roleLabels\[participant\.role\] \?\? participant\.role|statusLabels\[facet\]/);
});

test('management, Reservation, Purchase history, and standalone source context reuse controlled Spanish labels', () => {
  const management = read('../src/components/operations/operational-fulfillments-workspace.tsx');
  const passengerContext = read('../src/components/operations/passenger-operational-context.tsx');
  const readiness = read('../src/components/operations/operational-readiness-dashboard.tsx');
  const history = read('../src/components/operations/operational-travel-history.tsx');
  const standalone = read('../src/components/operations/standalone-operational-requirements-workspace.tsx');
  const historyPresentation = read('../src/components/operations/operations-history-presentation.tsx');

  for (const source of [management, passengerContext, readiness, history]) assert.match(source, /operationalPassengerRoleLabel/);
  assert.match(management, /operationalStatusLabel\(item\.status\)/);
  assert.match(standalone, /operationalSourceLabel\(detail\.sourceType\)/);
  assert.match(standalone, /operationalSourceLabel\(requirement\.source\.type\)/);
  assert.match(historyPresentation, /operationalEvidenceTypeLabel\(evidenceType\)/);
  assert.doesNotMatch(standalone, /replaceAll\('_', ' '\)/);
  assert.doesNotMatch(historyPresentation, /\[value\] \?\? value/);
});
