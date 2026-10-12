import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const travel = () => read('../src/components/operations/operational-travel-history.tsx');
const cq = () => read('../src/components/operations/standalone-operational-requirements-workspace.tsx');
const presentation = () => read('../src/components/operations/operations-history-presentation.tsx');
const api = () => read('../src/lib/operations-api.ts');

test('Travel and CQ histories share read-only typed details without a common API model', () => {
  const shared = presentation();
  for (const text of [travel(), cq()]) assert.match(text, /HistoryTypedServiceDetails/);
  assert.match(shared, /OperationalServiceDetailFields servicePurposeCode=\{servicePurposeCode\} detailVersion=\{detailVersion\}/);
  assert.match(shared, /typedOperationalDetail\(detailPayload, servicePurposeCode\)/);
  assert.match(travel(), /BASE_TRIP/);
  assert.match(travel(), /ADDITIONAL_SERVICES/);
  assert.match(api(), /getCustomQuotationOperationsHistoryDetail\(fulfillmentId: string\)/);
  assert.match(api(), /custom-quotation-history\/\$\{encodeURIComponent\(fulfillmentId\)\}/);
});

test('CQ history uses shared list, detail, terminal, purchase, and evidence presentation', () => {
  const text = cq();
  for (const primitive of ['HistoryFilterBar', 'HistoryTableShell', 'HistoryTableStateRow', 'HistoryPagination', 'HistoryDetailDialog', 'HistoryPurchaseCard', 'HistoryEvidenceRow', 'HistoryTerminalState', 'TerminalStatusBadge']) assert.match(text, new RegExp(primitive));
  assert.match(text, /function CustomQuotationOperationsHistoryDetailDialog/);
  assert.match(text, /byteSize=\{evidence\.byteSize\}/);
  assert.match(text, /getStandaloneOperationalEvidenceAccess\(detail\.requirementId, detail\.fulfillmentId, attachment\.id\)/);
  assert.match(text, /Ver documento fiscal/);
  assert.match(text, /HistoryPurchaseCard key=\{purchase\.id\}/);
  assert.match(text, /onClick=\{\(\) => setSelectedFulfillmentId\(item\.fulfillmentId\)\}/);
  assert.match(text, /event\.key === 'Enter' \|\| event\.key === ' '/);
});

test('shared history presentation preserves exact purchase and evidence metadata rendering', () => {
  const text = presentation();
  for (const label of ['Proveedor', 'Referencia', 'Subtotal', 'Impuesto', 'Total', 'Fecha de compra', 'Factura del proveedor', 'Notas', 'Evidencia operativa', 'Evidencia de compra']) assert.match(text, new RegExp(label));
  assert.match(text, /addFinanceMoneyDisplayValues/);
  assert.match(text, /formatFinanceMoneyDisplay/);
  assert.match(text, /formatBytes\(byteSize\)/);
  assert.match(text, /CONFIRMED' \? 'Confirmado' : 'Cancelado'/);
});

test('history surfaces contain no execution or evidence mutation actions', () => {
  const cqText = cq();
  const cqHistory = cqText.slice(cqText.indexOf('function CustomQuotationOperationsHistory()'), cqText.indexOf('function CustomQuotationGroupDetail'));
  for (const text of [travel(), cqHistory, presentation()]) for (const forbidden of ['Registrar compra', 'Confirmar gestión', 'Editar reserva', 'Subir documento', 'Eliminar documento']) assert.doesNotMatch(text, new RegExp(forbidden));
});
