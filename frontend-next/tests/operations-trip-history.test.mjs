import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const shell = () => read('../src/components/operations/operations-trip-shell.tsx');
const unified = () => read('../src/components/operations/operational-unified-workspace.tsx');
const history = () => read('../src/components/operations/operational-travel-history.tsx');
const api = () => read('../src/lib/operations-api.ts');

test('trip shell owns the flattened Resumen, Operaciones, and Historial navigation', () => {
  const tripShell = shell();
  const text = unified();
  for (const label of ['Resumen', 'Operaciones', 'Historial']) assert.match(tripShell, new RegExp(label));
  assert.match(tripShell, /<OperationalUnifiedWorkspace travelPackageId=\{travelPackageId\}/);
  assert.match(tripShell, /<OperationalTravelHistory travelPackageId=\{travelPackageId\} \/>/);
  assert.doesNotMatch(text, /WorkspaceView|OperationalTravelHistory|>Activas<\/Button>|>Historial<\/Button>/);
  assert.match(text, /OperationalFulfillmentsWorkspace/);
  assert.match(text, /onCoverageChanged/);
});

test('trip history delegates terminal filtering and pagination to the bounded history API', () => {
  const text = history();
  const client = api();
  assert.match(text, /listOperationalTravelHistory\(\{/);
  assert.match(text, /travelPackageId: historyTravelPackageId \|\| undefined/);
  assert.match(text, /travelPackageParticipantId: historyParticipantId \|\| undefined/);
  assert.match(text, /sourceCategory,/);
  assert.match(text, /terminalStatus,/);
  assert.match(text, /datePreset: datePreset \|\| undefined/);
  for (const preset of ['TODAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'CUSTOM']) assert.match(text, new RegExp(preset));
  assert.match(client, /\/operations\/travel-packages\/history\?/);
  assert.match(client, /input\.datePreset === 'CUSTOM'/);
  assert.match(text, /HistoryPagination total=\{total\}/);
  assert.match(text, /void load\(page - 1\)/);
  assert.match(text, /void load\(page \+ 1\)/);
  assert.match(read('../src/components/operations/operations-history-presentation.tsx'), /Página \{page\} de \{totalPages\}/);
});

test('history list keeps passenger visibility and maps source and terminal labels without raw enums', () => {
  const text = history();
  assert.match(text, /BASE_TRIP: 'Contrato base'/);
  assert.match(text, /ADDITIONAL_SERVICES: 'Servicio adicional'/);
  assert.match(text, /<TerminalStatusBadge status=\{item\.terminalStatus\}/);
  assert.doesNotMatch(text, /PURCHASED/);
  assert.match(text, /item\.passengers\.map\(\(passenger\) => passenger\.fullName\)/);
  assert.match(text, /operationalPassengerRoleLabel\(passenger\.role\)/);
  assert.match(text, /item\.passengerCount/);
  assert.match(text, /item\.reservation\.providerName/);
  assert.match(text, /item\.purchase\.taxAmount/);
  assert.match(text, /item\.evidenceCount/);
  assert.match(text, /formatDateTime\(item\.terminalAt\)/);
});

test('history owns one bounded passenger roster per selected trip rather than relying on active Operations', () => {
  const text = history();
  assert.match(text, /export function OperationalTravelHistory\(\{ travelPackageId \}: \{ travelPackageId: string \}\)/);
  assert.match(text, /getAvailableTravelPackages\(\)/);
  assert.match(text, /getOperationalPassengerRoster\(selectedTravelPackageId\)/);
  assert.match(text, /<option value="">Todos los viajes<\/option>/);
  assert.match(text, /passengerOptions\.map\(\(passenger\) => <option/);
  assert.doesNotMatch(text, /getOperationalPassengerOverview/);
});

test('history detail is a read-only terminal view with safe existing evidence access', () => {
  const text = history();
  const client = api();
  assert.match(text, /getOperationalTravelHistoryDetail\(fulfillmentId\)/);
  assert.match(client, /\/operations\/travel-packages\/history\/\$\{encodeURIComponent\(fulfillmentId\)\}/);
  assert.match(text, /getOperationalEvidenceAccess\(detail\.trip\.travelPackageId, detail\.requirementId, detail\.fulfillmentId, current\.id\)/);
  assert.match(text, /AttachmentViewer/);
  assert.match(text, /detail\.detailPayload/);
  assert.match(text, /detail\.purchases\.map/);
  assert.match(text, /detail\.terminalContext\.confirmationReference/);
  assert.match(text, /formatBusinessDate\(start\)/);
  for (const forbidden of ['Reservar', 'Registrar compra', 'Confirmar', 'Cancelar', 'Editar']) assert.doesNotMatch(text, new RegExp(forbidden));
});

test('Custom Quotation history remains separate while using shared presentation primitives', () => {
  const standalone = read('../src/components/operations/standalone-operational-requirements-workspace.tsx');
  const shared = read('../src/components/operations/operations-history-presentation.tsx');
  assert.match(standalone, /function CustomQuotationOperationsHistory\(\)/);
  assert.match(standalone, /listCustomQuotationOperationsHistory/);
  assert.doesNotMatch(standalone, /OperationalTravelHistory/);
  assert.match(standalone, /HistoryTableShell/);
  assert.match(shared, /function TerminalStatusBadge/);
});
