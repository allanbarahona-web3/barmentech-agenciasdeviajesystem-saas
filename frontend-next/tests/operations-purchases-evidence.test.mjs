import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const workspace = () => read('../src/components/operations/operational-purchases-evidence-workspace.tsx');
const drawer = () => read('../src/components/operations/operational-purchase-drawer.tsx');
const client = () => read('../src/lib/operations-api.ts');

test('Purchases are fulfillment-scoped, paginated, and support an empty state plus multiple records', () => {
  const source = workspace();
  for (const text of ['Compras', 'No hay compras registradas para esta gestión.', 'Registrar compra', 'Vendido:', 'Comprado', 'listOperationalPurchases', 'pageSize: \'20\'']) assert.match(source + client(), new RegExp(text));
  assert.match(source, /fulfillmentId/);
  assert.match(source, /purchases\.items\.map/);
  assert.match(source, /soldValue\?\.scope === 'EXACT_SERVICE_LINE'/);
  assert.doesNotMatch(source, /margen|margin|utilidad|ganancia/i);
});

test('Purchases and Documents are both visible in the selected management flow', () => {
  const source = workspace();
  for (const label of ['Gestión del servicio', 'Contexto del servicio', 'Gestión / estado', 'Compras', 'Documentos']) assert.match(source, new RegExp(label));
  assert.match(source, /<PurchasesPanel purchases=\{purchases\}/);
  assert.match(source, /<EvidencePanel evidence=\{evidence\}/);
  assert.match(source, /No hay documentos asociados\./);
  assert.doesNotMatch(source, /const \[section, setSection\]/);
  assert.doesNotMatch(source, /<nav className="flex gap-2" aria-label="Compras y documentos">/);
});

test('Purchase create keeps decimal strings, validates money and currency, and preserves tenant-local purchase time', () => {
  const source = drawer();
  assert.match(source, /import \{ Select \} from '@\/components\/ui\/select';/);
  assert.match(source, /preferredCurrency/);
  assert.match(source, /<option value=\{preferredCurrency\}>\{preferredCurrency\}<\/option>/);
  assert.match(source, /<option value="USD">USD<\/option>/);
  assert.doesNotMatch(source, /<Input id="purchase-currency"/);
  assert.match(source, /amount: form\.amount\.trim\(\)/);
  assert.match(source, /\^\\d\+\(\?:\\\.\\d\{1,5\}\)\?\$/);
  assert.match(source, /isPositiveMoney/);
  assert.match(source, /taxAmount/);
  assert.match(source, /\^\[A-Za-z\]\{3\}\$/);
  assert.match(source, /tenantDateTimeInputToUtc\(form\.purchasedAt, timeZone\)/);
  assert.doesNotMatch(source, /parseFloat\(.*amount|Number\(.*amount/);
});

test('Purchase form can persist an optional linked document after the Purchase succeeds', () => {
  const source = drawer();
  for (const text of ['Número de factura del proveedor', 'evidenceFile']) assert.match(source, new RegExp(text));
  assert.match(source, /Documento de respaldo \(opcional\)/);
  assert.match(source, /const purchase = travelPackageId/);
  assert.match(source, /await createOperationalPurchase\(travelPackageId, requirementId, effectiveFulfillmentId, input\)/);
  assert.match(source, /await createStandaloneOperationalPurchase\(requirementId, effectiveFulfillmentId, input\)/);
  assert.match(source, /operationalPurchaseId: purchase\.id/);
  assert.match(source, /await uploadOperationalEvidence/);
  assert.match(source, /await uploadStandaloneOperationalEvidence/);
  assert.match(source, /onCreated\(\{ evidenceUploadFailed \}\)/);
  assert.doesNotMatch(source, /margen|margin|utilidad|ganancia/i);
});

test('Purchase lifecycle, finance feedback, and immutability follow the backend contract', () => {
  const source = drawer();
  assert.match(workspace(), /Promise\.all\(\[loadContext\(\), loadPurchases\(\), loadEvidence\(\)\]\)/);
  assert.match(source, /FINANCIAL_ELIGIBILITY_BLOCKED/);
  assert.match(source, /FINANCIAL_ELIGIBILITY_UNAVAILABLE/);
  assert.match(workspace(), /const historyOnly = fulfillment\?\.status === 'CONFIRMED' \|\| fulfillment\?\.status === 'CANCELLED'/);
  assert.match(workspace(), /!historyOnly/);
  assert.match(workspace(), /El proveedor, monto, moneda, impuesto y fecha de compra son inmutables/);
  assert.doesNotMatch(source, /deleteOperationalPurchase/);
});

test('Confirmed and cancelled management history is view-only while documents remain openable', () => {
  const source = workspace();
  assert.match(source, /historyOnly \? <p[^>]*>La gestión está cerrada; las compras se conservan como historial\.<\/p> : null/);
  assert.match(source, /!historyOnly \? <TableHead>Acciones<\/TableHead> : null/);
  assert.match(source, /canMutate=\{!historyOnly\}/);
  assert.match(source, /onOpen=\{\(item\) => void openEvidence\(item\)\}/);
  assert.match(source, /canMutate \? <Button[^>]*onClick=\{\(\) => onDelete\(item\)\}/);
  assert.match(source, /canMutate \? <Button[^>]*onClick=\{onUpload\}/);
});

test('Evidence uses the Operations MIME and size limits, current fulfillment purchases, and no local fake row', () => {
  const source = workspace();
  for (const mime of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) assert.match(source, new RegExp(mime));
  assert.match(source, /10 \* 1024 \* 1024/);
  assert.match(source, /El archivo está vacío/);
  assert.match(source, /Solo se permiten archivos PDF, JPEG, PNG o WebP/);
  assert.match(source, /\(purchases\?\.items \?\? \[\]\)\.map/);
  assert.match(source, /Documento general de la gestión/);
  assert.match(source, /uploadOperationalEvidence/);
  assert.doesNotMatch(source, /setEvidence\([^)]*\[.*evidenceFile/s);
});

test('Evidence signing happens only on the explicit open action and storage internals stay hidden', () => {
  const source = workspace();
  assert.match(source, /async function openEvidence/);
  assert.match(source, /AttachmentViewer/);
  assert.match(source, /getOperationalEvidenceAccess\(travelPackageId, requirementId, fulfillmentId, attachment\.id\)/);
  assert.doesNotMatch(source, /objectKey/);
  assert.doesNotMatch(source, /localStorage.*url/s);
});

test('Evidence deletion is confirmed and surfaces storage cleanup failures without Purchase, AP, FX, or margin UI', () => {
  const source = workspace();
  assert.match(source, /¿Eliminar documento\?/);
  assert.match(source, /deleteOperationalEvidence/);
  assert.match(source, /STORAGE_DELETE_FAILED/);
  assert.doesNotMatch(source, /Accounts Payable|margen|margin|FX|tipo de cambio/i);
});

test('Operations API centralizes purchase and evidence transport, including multipart upload and on-demand access', () => {
  const source = client();
  for (const name of ['listOperationalPurchases', 'createOperationalPurchase', 'updateOperationalPurchase', 'listOperationalEvidence', 'uploadOperationalEvidence', 'getOperationalEvidenceAccess', 'deleteOperationalEvidence']) assert.match(source, new RegExp(name));
  assert.match(source, /operationsFormRequest/);
  assert.match(source, /formData\.append\('file', input\.file/);
});

test('Purchases/Documents and management both use the one canonical Purchase drawer', () => {
  const history = workspace(); const management = read('../src/components/operations/operational-fulfillments-workspace.tsx'); const standalone = read('../src/components/operations/standalone-operational-requirements-workspace.tsx'); const form = drawer();
  assert.match(history, /<OperationalPurchaseDrawer/);
  assert.match(management, /<OperationalPurchaseDrawer/);
  assert.match(standalone, /<OperationalPurchaseDrawer/);
  assert.equal((history.match(/operational-purchase-form/g) ?? []).length, 0);
  assert.equal((management.match(/operational-purchase-form/g) ?? []).length, 0);
  assert.equal((form.match(/operational-purchase-form/g) ?? []).length, 2);
  for (const field of ['Proveedor', 'Referencia del proveedor', 'Monto', 'Moneda', 'Impuesto', 'Fecha de compra', 'Número de factura del proveedor', 'Documento de respaldo \\(opcional\\)', 'Notas']) assert.match(form, new RegExp(field));
});

test('Drawer preserves Finance-blocked form state and reports evidence partial success without retrying Purchase', () => {
  const source = drawer();
  assert.match(source, /FINANCIAL_ELIGIBILITY_BLOCKED/);
  assert.match(source, /setError\(createdFulfillment \? 'La gestión se creó, pero no se pudo registrar la compra/);
  assert.match(source, /operationalPurchaseId: purchase\.id/);
  assert.match(source, /let evidenceUploadFailed = false/);
  assert.match(source, /evidenceUploadFailed = true/);
  assert.equal((source.match(/createOperationalPurchase\(/g) ?? []).length, 1, 'one Purchase-create call');
});

test('Operations error states retain mapped Spanish guidance and otherwise use a safe fallback', () => {
  const text = workspace();
  assert.match(text, /FINANCIAL_ELIGIBILITY_BLOCKED/);
  assert.match(text, /STORAGE_DELETE_FAILED/);
  assert.match(text, /return operationsErrorMessage\(reason, fallback\)/);
  assert.match(client(), /export function operationsErrorMessage\(_reason: unknown, fallback: string\): string \{ return fallback; \}/);
});
