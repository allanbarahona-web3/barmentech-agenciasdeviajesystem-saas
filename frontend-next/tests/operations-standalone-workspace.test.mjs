import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const workspace = () => read('../src/components/operations/standalone-operational-requirements-workspace.tsx');
const api = () => read('../src/lib/operations-api.ts');

test('standalone Operations navigation and route remain separate from travel workspaces', () => {
  const nav = read('../src/components/vertical-nav.tsx');
  const landing = read('../src/components/operations/operations-landing.tsx');
  const route = read('../src/app/operations/standalone/page.tsx');
  assert.match(nav, /href: "\/operations\/standalone", label: "Cotizaciones personalizadas"/);
  assert.match(landing, /Cotizaciones personalizadas/);
  assert.match(landing, /\/operations\/standalone/);
  assert.match(route, /OperationsAccessGate/);
  assert.match(route, /StandaloneOperationalRequirementsWorkspace/);
});

test('Custom Quotation queue uses the grouped version read model and preserves child management', () => {
  const text = workspace();
  assert.match(text, /listCustomQuotationOperationsGroups/);
  assert.match(text, /getStandaloneOperationalRequirement/);
  assert.match(text, /CUSTOM_QUOTATION_LINE/);
  assert.match(text, /Cotización personalizada/);
  for (const label of ['Identificación', 'Cotización #', 'Valor total', 'Cantidad de servicios', 'Gestionar servicio']) assert.match(text, new RegExp(label));
  assert.match(text, /item\.serviceCount/);
  assert.match(text, /item\.commercialValue\.amount/);
  assert.match(text, /requirement\.requirementId/);
  assert.doesNotMatch(text, /Solicitud independiente|solicitudes independientes/);
  assert.match(api(), /CustomQuotationOperationsGroup/);
  assert.match(api(), /custom-quotation-groups/);
  assert.match(api(), /scopeType: 'STANDALONE_CUSTOMER'/);
  assert.doesNotMatch(text, /TripContextHeader|PassengerMatrix|Roster|destination|travelPackageParticipant/);
});

test('Custom Quotation fiscal visibility uses the existing accepted-document viewer', () => {
  const text = workspace();
  const apiText = api();
  const viewer = read('../src/app/fiscal-billing/invoices/[billingDocumentId]/page.tsx');
  for (const field of ['billingDocumentId', 'billingDocumentType', 'fiscalDocumentNumber', 'fiscalKey', 'fiscalTotal', 'fiscalStatus']) assert.match(apiText, new RegExp(field));
  assert.match(text, /Factura/);
  assert.match(text, /Tiquete/);
  assert.match(text, /Sin factura emitida/);
  assert.match(text, /Ver documento fiscal/);
  assert.match(text, /\/fiscal-billing\/invoices\/\$\{encodeURIComponent\(group\.billingDocumentId\)\}/);
  assert.match(viewer, /role !== 'OPERACIONES'/);
  assert.match(viewer, /const readOnlyViewer = customerScopedReadOnly \|\| viewerRole === 'OPERACIONES'/);
  assert.match(viewer, /\{!readOnlyViewer \? <Button/);
  assert.doesNotMatch(text, /generateAcceptedInvoicePdf|requestAcceptedInvoiceEmailResend/);
});

test('Custom Quotation services render backend finance eligibility and gate procurement actions', () => {
  const text = workspace();
  const apiText = api();
  for (const status of ['PENDIENTE_FACTURACION', 'PENDIENTE_ACEPTACION_FISCAL', 'PENDIENTE_REGISTRO_FINANCIERO', 'PENDIENTE_PAGO', 'LISTO_PARA_PROCESAR']) {
    assert.match(apiText, new RegExp(status));
    assert.match(text, new RegExp(status));
  }
  for (const label of ['Pendiente de facturación', 'Pendiente de aceptación fiscal', 'Pendiente de registro financiero', 'Pendiente de pago', 'Listo para procesar']) assert.match(text, new RegExp(label));
  assert.match(text, /<FinanceEligibilityBadge status=\{requirement\.eligibilityStatus\}/);
  assert.match(text, /const canProcess = financeEligibility\.eligibilityStatus === 'LISTO_PARA_PROCESAR'/);
  assert.match(text, /disabled=\{!canProcess\}/);
  assert.match(text, /<Button type="button" size="sm" disabled=\{!canProcess\}/);
  assert.match(text, /Este servicio requiere un documento fiscal antes de poder procesarse\./);
  assert.match(text, /Este servicio podrá procesarse cuando el saldo esté cancelado\./);
  assert.doesNotMatch(text, /billingDocumentType === '04'.*LISTO_PARA_PROCESAR/s);
});

test('Custom Quotation purchase uses standalone endpoints without passenger calls', () => {
  const text = workspace();
  const apiText = api();
  const drawer = read('../src/components/operations/operational-purchase-drawer.tsx');
  for (const name of ['createStandaloneOperationalFulfillment', 'OperationalPurchaseDrawer']) assert.match(text, new RegExp(name));
  for (const name of ['createStandaloneOperationalPurchase', 'uploadStandaloneOperationalEvidence']) assert.match(drawer, new RegExp(name));
  assert.match(drawer, /FINANCIAL_ELIGIBILITY_BLOCKED/);
  assert.doesNotMatch(text, /participantIds|addOperationalFulfillmentPassengers|removeOperationalFulfillmentPassengers/);
  assert.match(apiText, /\/operations\/standalone\/requirements/);
  assert.match(apiText, /function standaloneFulfillmentsPath/);
  assert.match(apiText, /function standalonePurchasesPath/);
  assert.match(apiText, /function standaloneEvidencePath/);
});

test('Custom Quotation purchase entry is canonical for every fulfillment state', () => {
  const text = workspace();
  const drawer = read('../src/components/operations/operational-purchase-drawer.tsx');
  assert.match(text, /<h2 className="font-semibold">Compras<\/h2>/);
  assert.match(text, /<Button type="button" size="sm" disabled=\{!canProcess\}[^>]*onClick=\{openPurchase\}>.*Registrar compra/s);
  assert.match(text, /fulfillments\.map\(\(fulfillment\) => <Card key=\{fulfillment\.id\}>/);
  assert.match(text, /fulfillment\.status === 'PURCHASED' \? <Button[^>]*onClick=\{\(\) => openConfirmation\(fulfillment\)\}>Confirmar<\/Button>/);
  assert.match(text, /<OperationalPurchaseDrawer open onOpenChange=/);
  assert.match(text, /fulfillmentId=\{purchaseFulfillmentId\} ensureFulfillment=\{ensurePurchaseFulfillment\}/);
  for (const status of ['DRAFT', 'RESERVED', 'PURCHASED']) assert.match(text, new RegExp(`fulfillment\\.status === '${status}'`));
  assert.match(drawer, /setForm\(\{ \.\.\.emptyPurchase\(preferredCurrency\), providerName: providerName \?\? '' \}\)/);
  assert.match(drawer, /setForm\(\(value\) => \(\{ \.\.\.value, providerName: event\.target\.value \}\)\)/);
  assert.match(text, /createStandaloneOperationalFulfillment\(requirementId, \{\}\)/);
  assert.match(text, /Compra registrada correctamente/);
  assert.match(text, /fulfillmentLabels\[fulfillment\.status\]/);
  for (const label of ['Proveedor', 'Referencia del proveedor', 'Monto', 'Moneda', 'Impuesto', 'Fecha de compra', 'Número de factura del proveedor', 'Notas', 'Documento de respaldo \\(opcional\\)']) assert.match(drawer, new RegExp(label));
  assert.match(drawer, /await uploadStandaloneOperationalEvidence\(requirementId, effectiveFulfillmentId, \{ evidenceType: 'OTHER', operationalPurchaseId: purchase\.id, file: evidenceFile \}\)/);
});

test('all Custom Quotation records use the canonical purchase path and legacy management has no references', () => {
  const text = workspace();
  const drawer = read('../src/components/operations/operational-purchase-drawer.tsx');
  assert.match(text, /function openPurchase\(\) \{ setError\(null\); setPurchaseFulfillmentId\(null\); setPurchaseOpen\(true\); \}/);
  assert.match(text, /if \(purchaseFulfillmentId\) return \{ id: purchaseFulfillmentId, created: false \}/);
  assert.match(text, /fulfillments\.find\(\(fulfillment\) => fulfillment\.status === 'DRAFT' \|\| fulfillment\.status === 'RESERVED'\)/);
  assert.match(text, /const created = await createStandaloneOperationalFulfillment\(requirementId, \{\}\);/);
  assert.match(text, /setPurchaseFulfillmentId\(created\.id\);\s*await load\(\);\s*return \{ id: created\.id, created: true \}/);
  assert.match(text, /fulfillmentId=\{purchaseFulfillmentId\} ensureFulfillment=\{ensurePurchaseFulfillment\}/);
  assert.match(drawer, /const resolvedFulfillment = fulfillmentId \? \{ id: fulfillmentId, created: false \} : await ensureFulfillment\?\.\(\)/);
  assert.match(drawer, /const effectiveFulfillmentId = resolvedFulfillment\.id/);
  assert.match(drawer, /createStandaloneOperationalPurchase\(requirementId, effectiveFulfillmentId, input\)/);
  assert.match(drawer, /La gestión se creó, pero no se pudo registrar la compra\. Inténtelo de nuevo; se reutilizará esta gestión\./);
  for (const legacy of ['Nueva gestión', 'Gestiones', 'StandaloneFulfillmentWorkflow', 'directPurchase', 'editingProvider', 'uploadStandaloneOperationalEvidence', 'listStandaloneOperationalPurchases', 'listStandaloneOperationalEvidence']) assert.doesNotMatch(text, new RegExp(legacy));
  assert.ok(text.indexOf("if (sourceType === 'CUSTOM_QUOTATION_LINE')") < text.indexOf('function StandaloneRequirementDetail'), 'source type is only a display label, not a purchase-layout branch');
});

test('Custom Quotation confirmation still persists its reference before confirming', () => {
  const text = workspace();
  assert.match(text, /<DialogTitle>Confirmar gestión<\/DialogTitle>/);
  assert.match(text, /Referencia de confirmación/);
  assert.match(text, /disabled=\{confirming \|\| !confirmationReference\.trim\(\)\}/);
  assert.match(text, /OPERATIONAL_FULFILLMENT_CONFIRMATION_CONTEXT_REQUIRED/);
  const saveContextAt = text.indexOf('await updateStandaloneOperationalFulfillment(requirementId, confirmationFulfillment.id, { confirmationReference: reference })');
  const transitionAt = text.indexOf("await transitionStandaloneOperationalFulfillment(requirementId, confirmationFulfillment.id, 'CONFIRMED')");
  assert.ok(saveContextAt >= 0, 'confirmation reference is persisted');
  assert.ok(transitionAt > saveContextAt, 'CONFIRMED transition follows persisted context');
  assert.match(text, /setConfirmError\(confirmationErrorMessage\(reason\)\)/);
});
