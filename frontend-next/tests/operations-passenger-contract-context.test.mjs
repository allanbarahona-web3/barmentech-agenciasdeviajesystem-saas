import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const workspace = () => read('../src/components/operations/operational-unified-workspace.tsx');
const api = () => read('../src/lib/operations-api.ts');

test('selected-passenger context models bounded Contract context and operational notes', () => {
  const source = api();
  for (const field of ['contractContexts', 'contractNumber', 'sourceRole', 'perPersonSellingPrice', 'commercialTotal', 'frozenAt', 'operationalNotes', 'authorName']) assert.match(source, new RegExp(field));
  assert.match(source, /OperationalPassengerContractRole = 'HOLDER' \| 'COMPANION' \| 'MINOR'/);
});

test('Contract context presents a contract number and localized passenger roles without raw role output', () => {
  const source = workspace();
  assert.match(source, /Contexto del contrato/);
  assert.match(source, /Contrato: \{context\.contractNumber\}/);
  assert.match(source, /role === 'HOLDER' \? 'Titular'/);
  assert.match(source, /role === 'COMPANION' \? 'Acompañante'/);
  assert.match(source, /role === 'MINOR' \? 'Menor'/);
  assert.match(source, /roleLabel\(context\.sourceRole\)/);
});

test('commercial presentation keeps frozen per-person context separate from legacy contract totals', () => {
  const source = workspace();
  assert.match(source, /context\.commercial\.snapshotAvailable && context\.commercial\.perPersonSellingPrice/);
  assert.match(source, /Precio por persona/);
  assert.match(source, /Total del contrato/);
  assert.match(source, /formatFinanceMoneyDisplay\(context\.commercial\.perPersonSellingPrice/);
  assert.match(source, /formatFinanceMoneyDisplay\(context\.commercial\.commercialTotal/);
  assert.match(source, /useTenantDateTimeFormatter/);
  assert.match(source, /Precio congelado/);
});

test('operational notes show returned Contract context with author and tenant-aware timestamp', () => {
  const source = workspace();
  assert.match(source, /Notas operativas/);
  assert.match(source, /noteSourceLabel\(note\.sourceType\)/);
  assert.match(source, /sourceType === 'CONTRACT' \? 'Contrato'/);
  assert.match(source, /note\.authorName/);
  assert.match(source, /formatDateTime\(note\.createdAt\)/);
});

test('the selected-passenger UI neither fabricates a client-profile section nor infers a responsible adult', () => {
  const source = workspace();
  assert.doesNotMatch(source, /<h3[^>]*>Perfil del cliente<\/h3>/);
  assert.doesNotMatch(source, /Sin información/);
  assert.match(source, /context\.responsibleAdult\?\.responsibleName/);
});

test('multiple Contract contexts stay distinct and context remains lazy for the selected passenger only', () => {
  const source = workspace();
  assert.match(source, /contexts\.map\(\(context\) => <article key=\{context\.contractId\}/);
  assert.match(source, /<PassengerCommercialContext participantId=\{passenger\.travelPackageParticipantId\}/);
  assert.match(source, /if \(!next \|\| context \|\| loading\) return/);
  assert.match(source, /getOperationalPassengerCommercialContext\(travelPackageId, participantId\)/);
  assert.match(source, /commercialRequests\.current\.get\(participantId\)/);
});

test('a contextual failure stays local to the selected-passenger context panel', () => {
  const source = workspace();
  assert.match(source, /No se pudo cargar el contexto del pasajero/);
  assert.match(source, /<Alert variant="destructive"><AlertDescription>\{error\}<\/AlertDescription><\/Alert>/);
});
