import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const action = () => read('../src/components/operations/passenger-operational-notes-action.tsx');
const dashboard = () => read('../src/components/operations/operational-unified-workspace.tsx');
const context = () => read('../src/components/operations/passenger-operational-context.tsx');
const reservation = () => read('../src/components/operations/operational-fulfillments-workspace.tsx');
const purchase = () => read('../src/components/operations/operational-purchase-drawer.tsx');
const api = () => read('../src/lib/operations-api.ts');

test('one reusable note action is rendered on dashboard rows and selected passenger contexts', () => {
  assert.match(dashboard(), /<PassengerOperationalNotesAction travelPackageId=\{travelPackageId\} participantId=\{participant\.travelPackageParticipantId\}/);
  assert.match(context(), /<PassengerOperationalNotesAction travelPackageId=\{travelPackageId\} participantId=\{contextParticipantIds\[index\]\}/);
  assert.match(reservation(), /travelPackageId=\{travelPackageId\} participantIds=\{reservationPassengerContext\.participantIds\}/);
  assert.match(purchase(), /travelPackageId=\{travelPackageId\} participantIds=\{participantIds\}/);
  assert.match(purchase(), /participantIds\?: readonly string\[\]/);
});

test('notes action has a compact human label and uses dashboard count without showing zero', () => {
  const source = action();
  const client = api();
  assert.match(source, /Notas operativas \(\$\{operationalNoteCount\}\)/);
  assert.match(source, /: 'Notas operativas'/);
  assert.match(dashboard(), /operationalNoteCount=\{item\.operationalNoteCount\}/);
  assert.match(client, /operationalNoteCount: number/);
});

test('notes are loaded only after click through the narrow Operations endpoint', () => {
  const source = action();
  const client = api();
  assert.match(source, /onClick=\{openNotes\}/);
  assert.match(source, /if \(!notes\) void loadNotes\(\)/);
  assert.match(source, /getOperationalPassengerNotes\(travelPackageId, participantId\)/);
  assert.doesNotMatch(source, /useEffect\(/);
  assert.match(client, /passengers\/\$\{encodeURIComponent\(participantId\)\}\/operational-notes/);
  assert.doesNotMatch(dashboard(), /getOperationalPassengerNotes/);
});

test('the cache is memory-only, passenger-isolated, and does not cache failures', () => {
  const source = action();
  assert.match(source, /new Map<string, OperationalPassengerNote\[\]>\(\)/);
  assert.match(source, /const cacheKey = `\$\{travelPackageId\}:\$\{participantId\}`/);
  assert.match(source, /operationalNotesCache\.set\(cacheKey, notes\)/);
  assert.match(source, /finally\(\(\) => operationalNotesLoads\.delete\(cacheKey\)\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/i);
});

test('the modal presents only normalized operational note context with friendly states', () => {
  const source = action();
  assert.match(source, /Notas operativas — \{passengerName\}/);
  assert.match(source, /Contrato \{note\.contract\.contractNumber\}/);
  assert.match(source, /note\.author\.displayName/);
  assert.match(source, /formatDateTime\(note\.createdAt\)/);
  assert.match(source, /No hay notas operativas para este pasajero\./);
  assert.match(source, /No se pudieron cargar las notas operativas\./);
  assert.match(source, /Reintentar/);
  assert.doesNotMatch(source, /note\.contract\.id/);
  assert.doesNotMatch(source, /CustomerNote|commercialNotes|customerFacingNotes|confirmationNotes|Purchase\.notes/);
});

test('selected-detail actions never guess a passenger identity from a client or name', () => {
  const source = context();
  assert.match(source, /participantIds\?\.length === contexts\.length/);
  assert.match(source, /contextParticipantIds\[index\]/);
  assert.doesNotMatch(source, /clientId|find\(.*displayName|find\(.*fullName/);
});
