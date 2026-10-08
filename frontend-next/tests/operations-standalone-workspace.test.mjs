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
  assert.match(text, /financeGated = target === 'RESERVED' \|\| target === 'CONFIRMED'/);
  assert.match(text, /Este servicio requiere un documento fiscal antes de poder procesarse\./);
  assert.match(text, /Este servicio podrá procesarse cuando el saldo esté cancelado\./);
  assert.doesNotMatch(text, /billingDocumentType === '04'.*LISTO_PARA_PROCESAR/s);
});

test('standalone fulfillment, purchase, and evidence use standalone endpoints without passenger calls', () => {
  const text = workspace();
  const apiText = api();
  const drawer = read('../src/components/operations/operational-purchase-drawer.tsx');
  for (const name of ['createStandaloneOperationalFulfillment', 'uploadStandaloneOperationalEvidence', 'getStandaloneOperationalEvidenceAccess', 'OperationalPurchaseDrawer']) assert.match(text, new RegExp(name));
  for (const name of ['createStandaloneOperationalPurchase', 'uploadStandaloneOperationalEvidence']) assert.match(drawer, new RegExp(name));
  assert.match(drawer, /FINANCIAL_ELIGIBILITY_BLOCKED/);
  assert.doesNotMatch(text, /participantIds|addOperationalFulfillmentPassengers|removeOperationalFulfillmentPassengers/);
  assert.match(apiText, /\/operations\/standalone\/requirements/);
  assert.match(apiText, /function standaloneFulfillmentsPath/);
  assert.match(apiText, /function standalonePurchasesPath/);
  assert.match(apiText, /function standaloneEvidencePath/);
});

test('purchased standalone fulfillment collects confirmation context before confirmation', () => {
  const text = workspace();
  assert.match(text, /target === 'CONFIRMED' && fulfillment\.status === 'PURCHASED' \? openConfirmation\(\)/);
  assert.match(text, /<DialogTitle>Confirmar gestión<\/DialogTitle>/);
  assert.match(text, /Referencia de confirmación/);
  assert.match(text, /disabled=\{confirming \|\| !confirmationReference\.trim\(\)\}/);
  assert.match(text, /OPERATIONAL_FULFILLMENT_CONFIRMATION_CONTEXT_REQUIRED/);
  const saveContextAt = text.indexOf("await updateStandaloneOperationalFulfillment(requirementId, fulfillmentId, { confirmationReference: reference })");
  const transitionAt = text.indexOf("await transitionStandaloneOperationalFulfillment(requirementId, fulfillmentId, 'CONFIRMED')");
  assert.ok(saveContextAt >= 0, 'confirmation reference is persisted');
  assert.ok(transitionAt > saveContextAt, 'CONFIRMED transition follows persisted context');
  assert.match(text, /setConfirmOpen\(false\); setConfirmationReference\(''\);\s*await load\(\); onChanged\(\);/);
  assert.match(text, /setConfirmError\(confirmationErrorMessage\(reason\)\)/);
});

test('Custom Quotation purchase entry is primary, reusable, and keeps the reserved path', () => {
  const text = workspace();
  const drawer = read('../src/components/operations/operational-purchase-drawer.tsx');
  assert.match(text, /const transitions = fulfillment\.status === 'DRAFT' \? \['RESERVED', 'CANCELLED'\].*fulfillment\.status === 'RESERVED' \? \['CANCELLED'\]/);
  assert.doesNotMatch(text, /\['RESERVED', 'PURCHASED'/);
  assert.match(text, /const canRegisterPurchase = fulfillment\.status === 'DRAFT' \|\| fulfillment\.status === 'RESERVED'/);
  assert.match(text, /canRegisterPurchase \? <Button[^>]*>.*Registrar compra/s);
  assert.match(text, /<OperationalPurchaseDrawer open=\{purchaseOpen\}[^>]*providerName=\{fulfillment\.providerName\}/);
  assert.match(drawer, /setForm\(\{ \.\.\.emptyPurchase\(preferredCurrency\), providerName: providerName \?\? '' \}\)/);
  assert.match(drawer, /setForm\(\(value\) => \(\{ \.\.\.value, providerName: event\.target\.value \}\)\)/);
  assert.match(text, /El proveedor se registra al crear la compra/);
  assert.match(text, /createStandaloneOperationalFulfillment\(requirementId, \{\}\)/);
  assert.doesNotMatch(text, /Proveedor \(opcional\)/);
  assert.match(text, /await load\(\); onChanged\(\);/);
  assert.match(text, /Compra registrada correctamente/);
  assert.match(text, /fulfillmentLabels\[fulfillment\.status\]/);
  for (const label of ['Proveedor', 'Referencia del proveedor', 'Monto', 'Moneda', 'Impuesto', 'Fecha de compra', 'Número de factura del proveedor', 'Notas', 'Documento de respaldo \\(opcional\\)']) assert.match(drawer, new RegExp(label));
  assert.match(drawer, /await uploadStandaloneOperationalEvidence\(requirementId, effectiveFulfillmentId, \{ evidenceType: 'OTHER', operationalPurchaseId: purchase\.id, file: evidenceFile \}\)/);
});

test('a service without fulfillment creates one DRAFT internally before its first purchase', () => {
  const text = workspace();
  const drawer = read('../src/components/operations/operational-purchase-drawer.tsx');
  assert.match(text, /const \[directPurchaseOpen, setDirectPurchaseOpen\] = useState\(false\)/);
  assert.match(text, /fulfillments\.length === 0 \? <Card>.*Registrar compra/s);
  assert.match(text, /fulfillments\.length > 0 \? <Button[^>]*>.*Nueva gestión/s);
  assert.match(text, /function openDirectPurchase\(\) \{ setError\(null\); setDirectPurchaseFulfillmentId\(null\); setDirectPurchaseOpen\(true\); \}/);
  assert.match(text, /if \(directPurchaseFulfillmentId\) return \{ id: directPurchaseFulfillmentId, created: false \}/);
  assert.match(text, /const existing = fulfillments\[0\];/);
  assert.match(text, /const created = await createStandaloneOperationalFulfillment\(requirementId, \{\}\);/);
  assert.match(text, /setDirectPurchaseFulfillmentId\(created\.id\);\s*await load\(\);\s*return \{ id: created\.id, created: true \}/);
  assert.match(text, /fulfillmentId=\{directPurchaseFulfillmentId\} ensureFulfillment=\{ensureDirectFulfillment\}/);
  assert.match(drawer, /const resolvedFulfillment = fulfillmentId \? \{ id: fulfillmentId, created: false \} : await ensureFulfillment\?\.\(\)/);
  assert.match(drawer, /const effectiveFulfillmentId = resolvedFulfillment\.id/);
  assert.match(drawer, /createStandaloneOperationalPurchase\(requirementId, effectiveFulfillmentId, input\)/);
  assert.match(drawer, /La gestión se creó, pero no se pudo registrar la compra\. Inténtelo de nuevo; se reutilizará esta gestión\./);
  assert.match(text, /fulfillmentLabels\[fulfillment\.status\]/);
});
