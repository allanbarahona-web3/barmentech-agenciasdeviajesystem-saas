import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const travel = () => read('../src/components/operations/operational-travel-history.tsx');
const cq = () => read('../src/components/operations/standalone-operational-requirements-workspace.tsx');
const api = () => read('../src/lib/operations-api.ts');

test('Travel and Additional history use the shared typed read-only renderer with persisted contract version', () => {
  const text = travel();
  assert.match(text, /OperationalServiceDetailFields servicePurposeCode=\{detail\.requirement\.servicePurposeCode\} detailVersion=\{detail\.detailVersion\}/);
  assert.match(text, /typedOperationalDetail\(detail\.detailPayload, detail\.requirement\.servicePurposeCode\)/);
  assert.match(text, /BASE_TRIP/);
  assert.match(text, /ADDITIONAL_SERVICES/);
});

test('CQ list stays compact while one dedicated terminal-detail request drives typed history rendering', () => {
  const text = cq();
  const client = api();
  assert.match(client, /getCustomQuotationOperationsHistoryDetail\(fulfillmentId: string\)/);
  assert.match(client, /custom-quotation-history\/\$\{encodeURIComponent\(fulfillmentId\)\}/);
  assert.match(text, /<CustomQuotationHistoryDetail fulfillmentId=\{selected\.fulfillmentId\}/);
  assert.match(text, /OperationalServiceDetailFields servicePurposeCode=\{detail\.servicePurposeCode\} detailVersion=\{detail\.detailVersion\}/);
  const rowContract = client.slice(client.indexOf('export interface CustomQuotationOperationsHistoryRow'), client.indexOf('export interface CustomQuotationOperationsHistoryDetail'));
  assert.doesNotMatch(rowContract, /detailPayload/);
});

test('history detail exposes strong references, exact display totals, and read-only evidence metadata', () => {
  for (const text of [travel(), cq()]) {
    for (const label of ['Referencia del proveedor', 'Reserva', 'Voucher', 'Boleto / ticket', 'Subtotal', 'Impuesto', 'Total', 'Evidencia operativa', 'Evidencia de compra']) assert.match(text, new RegExp(label));
    assert.match(text, /addFinanceMoneyDisplayValues/);
  }
});

test('history surfaces contain no execution or evidence mutation actions', () => {
  const travelText = travel();
  const cqStart = cq().indexOf('function CustomQuotationHistory()');
  const cqEnd = cq().indexOf('function CustomQuotationGroupDetail');
  const cqHistory = cq().slice(cqStart, cqEnd);
  for (const text of [travelText, cqHistory]) for (const forbidden of ['Reservar', 'Registrar compra', 'Confirmar gestión', 'Editar reserva', 'Subir documento', 'Eliminar documento']) assert.doesNotMatch(text, new RegExp(forbidden));
});
