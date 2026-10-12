import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const workspace = () => read('../src/components/operations/operational-fulfillments-workspace.tsx');
const drawer = () => read('../src/components/operations/operational-purchase-drawer.tsx');
const api = () => read('../src/lib/operations-api.ts');

test('Travel and Additional requirements receive the linear execution entry with no legacy creation controls', () => {
  const text = workspace();
  assert.match(text, /TRAVEL_PACKAGE_COST_COMPONENT/);
  assert.match(text, /ADDITIONAL_SERVICE_ORDER_LINE/);
  assert.match(text, /function isLinearPurchaseSource/);
  for (const label of ['Reservar', 'Registrar compra']) assert.match(text, new RegExp(label));
  assert.match(text, /canStartExecution && linearExecution \? <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick=\{openNewReservation\}>Reservar/);
  assert.match(text, /onClick=\{\(\) => void openDirectPurchase\(\)\}>Registrar compra/);
  assert.doesNotMatch(text, /Nueva gestión|Crear gestión|openCreate|createOperationalFulfillment/);
  assert.doesNotMatch(api(), /export function createOperationalFulfillment/);
});

test('Direct purchase ensures an exact uncovered participant scope and retains the resolved fulfillment for retry', () => {
  const text = workspace();
  const client = api();
  assert.match(text, /!requirement\.confirmedPassengerIds\.includes/);
  assert.match(text, /const \[purchaseTarget, setPurchaseTarget\]/);
  assert.match(text, /const \[purchaseScope, setPurchaseScope\]/);
  assert.match(text, /async function ensurePurchaseFulfillment\(\)/);
  assert.match(text, /ensureOperationalFulfillment\(travelPackageId, requirementId, purchaseScope\)/);
  assert.match(text, /setPurchaseTarget\(result\.fulfillment\)/);
  assert.match(text, /fulfillmentId=\{purchaseTarget\?\.id\} ensureFulfillment=\{purchaseTarget \? undefined : ensurePurchaseFulfillment\}/);
  assert.match(client, /export function ensureOperationalFulfillment/);
  assert.match(client, /fulfillmentsPath\(travelPackageId, requirementId, '\/ensure'\)/);
  assert.match(client, /\{ participantIds \}/);
});

test('Reservation uses ensure/reuse, preserves selected identities, and does not create a purchase', () => {
  const text = workspace();
  assert.match(text, /formMode === 'reserve'/);
  assert.match(text, /ensureOperationalFulfillment\(travelPackageId, requirementId, \[\.\.\.selected\]\)/);
  assert.match(text, /updateOperationalFulfillment\(travelPackageId, requirementId, fulfillment\.id, input\)/);
  assert.match(text, /transitionOperationalFulfillment\(travelPackageId, requirementId, updated\.id, 'RESERVED'\)/);
  assert.match(text, /formMode === 'reserve' && !editing/);
  assert.match(text, /La reserva es una intención operativa; no registra una compra\./);
  assert.doesNotMatch(text, /createOperationalPurchase|uploadOperationalEvidence/);
});

test('Reserved purchases reuse fulfillment context and prefill the supplier reference safely', () => {
  const text = workspace();
  const purchaseDrawer = drawer();
  assert.match(text, /getOperationalFulfillment\(travelPackageId, requirementId, item\.id\)/);
  assert.match(text, /providerName=\{purchaseTarget\?\.providerName\}/);
  assert.match(text, /providerReference=\{purchaseTarget\?\.providerReference\}/);
  assert.match(purchaseDrawer, /providerReference\?: string \| null/);
  assert.match(purchaseDrawer, /supplierReference: providerReference \?\? ''/);
  assert.doesNotMatch(purchaseDrawer, /reservationNotes/);
});

test('Purchased work is summarized, confirms through persisted context, and exposes no regular duplicate purchase action', () => {
  const text = workspace();
  assert.match(text, /Pendiente de compra/);
  assert.match(text, /Pendiente de confirmación/);
  assert.match(text, /item\.purchase\.supplierInvoiceNumber/);
  assert.match(text, /item\.purchase\.evidenceCount/);
  assert.match(text, /formatDateTime\(item\.purchase\.purchasedAt\)/);
  assert.match(text, /const canRegisterPurchase = \(item\.status === 'DRAFT' \|\| item\.status === 'RESERVED'\) && item\.purchaseCount === 0/);
  assert.match(text, /const canConfirm = linearExecution \? purchased/);
  assert.match(text, /title="Confirmar gestión"/);
  assert.match(text, /const input: FulfillmentInput = .*confirmationDetailChanged/s);
  assert.match(text, /updateOperationalFulfillment\(travelPackageId, requirementId, confirmationTarget\.id, input\)/);
  assert.match(text, /transitionOperationalFulfillment\(travelPackageId, requirementId, confirmationTarget\.id, 'CONFIRMED'\)/);
  assert.match(text, /onCoverageChanged\?\.\(\)/);
});

test('Management remains need-scoped, keeps passenger labels, cancellation, view, and reservation-only editing', () => {
  const text = workspace();
  for (const label of ['Gestión del servicio', 'No hay reservas o gestiones creadas para esta necesidad operativa.', 'Pasajeros', '¿Cancelar gestión?', 'Cancelar gestión', 'Ver']) assert.match(text, new RegExp(label));
  assert.match(text, /getOperationalRequirement\(travelPackageId, requirementId\)/);
  assert.match(text, /listOperationalFulfillments\(travelPackageId, requirementId, page\)/);
  assert.match(text, /passengerNames\(item\.passengerPreview, item\.passengerCount\)/);
  assert.match(text, /passengerNames\(requirement\.passengers\.map/);
  assert.match(text, /onPurchases=\{\(\) => setPurchasesFulfillment\(item\)\}/);
  assert.match(text, /if \(purchasesFulfillment\) return <OperationalPurchasesEvidenceWorkspace/);
  assert.match(text, />Editar reserva<\/Button>/);
  assert.doesNotMatch(text, />Editar<\/Button>/);
  assert.match(text, /onClick=\{\(\) => linearExecution \? onReserve\(\) : onMove\('RESERVED'\)\}/);
  assert.doesNotMatch(text, /addOperationalFulfillmentPassengers|removeOperationalFulfillmentPassengers|assignedToUserId|listTenantUsers/);
});

test('Travel and Additional action and fulfillment status semantics use shared design-system variants', () => {
  const text = workspace();
  const purchasesEvidence = read('../src/components/operations/operational-purchases-evidence-workspace.tsx');
  assert.match(text, /<Button size="sm" variant="outline" onClick=\{\(\) => linearExecution \? onReserve\(\) : onMove\('RESERVED'\)\}/);
  assert.match(text, /<Button type="submit" variant="outline" form="fulfillment-form"/);
  assert.match(text, /<Button size="sm" onClick=\{onRegisterPurchase\}/);
  assert.match(text, /<Button size="sm" variant="success" onClick=\{\(\) => linearExecution \? onConfirm\(\) : onMove\('CONFIRMED'\)\}/);
  assert.match(text, /<Button size="sm" variant="destructive" onClick=\{onCancel\}/);
  assert.match(text, /<Button size="sm" variant="ghost" onClick=\{onEditReservation\}/);
  assert.match(text, /status === 'CANCELLED' \? 'destructive' : status === 'RESERVED' \? 'warning' : status === 'PURCHASED' \|\| status === 'CONFIRMED' \? 'success' : 'outline'/);
  assert.match(purchasesEvidence, /function fulfillmentStatusVariant\(status: OperationalFulfillmentDetail\['status'\]\) \{ return status === 'CANCELLED' \? 'destructive' : status === 'RESERVED' \? 'warning' : status === 'PURCHASED' \|\| status === 'CONFIRMED' \? 'success' : 'outline'; \}/);
});

test('Standalone Custom Quotation uses the same drawer without changing its standalone flow', () => {
  const standalone = read('../src/components/operations/standalone-operational-requirements-workspace.tsx');
  assert.match(standalone, /createStandaloneOperationalFulfillment/);
  assert.match(standalone, /<OperationalPurchaseDrawer open/);
  assert.doesNotMatch(standalone, /ensureOperationalFulfillment/);
});
