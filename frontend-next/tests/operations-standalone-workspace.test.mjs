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

test('Custom Quotation purchase entry is canonical when no purchase exists', () => {
  const text = workspace();
  const drawer = read('../src/components/operations/operational-purchase-drawer.tsx');
  assert.match(text, /<h2 className="font-semibold">Compras<\/h2>/);
  assert.match(text, /const hasPurchase = fulfillments\.some\(\(fulfillment\) => fulfillment\.purchaseCount > 0 \|\| fulfillment\.status === 'PURCHASED'\)/);
  assert.match(text, /const terminalFulfillment = fulfillments\.some\(\(fulfillment\) => fulfillment\.status === 'CONFIRMED' \|\| fulfillment\.status === 'CANCELLED'\)/);
  assert.match(text, /const canRegisterPurchase = !hasPurchase && !terminalFulfillment/);
  assert.match(text, /canRegisterPurchase \? <Button type="button" size="sm" disabled=\{!canProcess\}[^>]*onClick=\{openPurchase\}>.*Registrar compra/s);
  assert.match(text, /fulfillments\.map\(\(fulfillment\) => <Card key=\{fulfillment\.id\}>/);
  assert.match(text, /fulfillment\.status === 'PURCHASED' && fulfillment\.purchaseCount > 0 \? <Button[^>]*onClick=\{\(\) => openConfirmation\(fulfillment\)\}>Confirmar<\/Button>/);
  assert.match(text, /<OperationalPurchaseDrawer open onOpenChange=/);
  assert.match(text, /fulfillmentId=\{purchaseFulfillmentId\} ensureFulfillment=\{ensurePurchaseFulfillment\}/);
  for (const status of ['PURCHASED', 'CONFIRMED', 'CANCELLED']) assert.match(text, new RegExp(`fulfillment\\.status === '${status}'`));
  assert.match(drawer, /setForm\(\{ \.\.\.emptyPurchase\(preferredCurrency\), providerName: providerName \?\? '' \}\)/);
  assert.match(drawer, /setForm\(\(value\) => \(\{ \.\.\.value, providerName: event\.target\.value \}\)\)/);
  assert.match(text, /createStandaloneOperationalFulfillment\(requirementId, \{\}\)/);
  assert.match(text, /Compra registrada correctamente/);
  assert.match(text, /fulfillmentLabels\[fulfillment\.status\]/);
  for (const label of ['Proveedor', 'Referencia del proveedor', 'Monto', 'Moneda', 'Impuesto', 'Fecha de compra', 'Número de factura del proveedor', 'Notas', 'Documento de respaldo \\(opcional\\)']) assert.match(drawer, new RegExp(label));
  assert.match(drawer, /await uploadStandaloneOperationalEvidence\(requirementId, effectiveFulfillmentId, \{ evidenceType: 'OTHER', operationalPurchaseId: purchase\.id, file: evidenceFile \}\)/);
});

test('Custom Quotation existing purchases use their persisted snapshot and expose no duplicate purchase action', () => {
  const text = workspace();
  const apiText = api();
  assert.match(apiText, /evidenceCount: number; evidence: \{ id: string; originalFilename: string; mimeType: string \} \| null/);
  assert.match(text, /function PurchaseSummary/);
  assert.match(text, /purchase\.providerName/);
  assert.match(text, /purchase\.amount, purchase\.currency/);
  assert.match(text, /formatDateTime\(purchase\.purchasedAt\)/);
  for (const label of ['Referencia del proveedor', 'Factura del proveedor', 'Impuesto', 'Documento', 'Notas:']) assert.match(text, new RegExp(label));
  assert.doesNotMatch(text, /Proveedor pendiente/);
  assert.doesNotMatch(text, /Registrar otra compra|Editar compra/);
  assert.match(text, /fulfillment\.purchase \? <PurchaseSummary purchase=\{fulfillment\.purchase\}/);
  assert.match(text, /getStandaloneOperationalEvidenceAccess\(requirementId, evidenceViewer\.fulfillmentId, attachment\.id\)/);
  assert.match(text, /<AttachmentViewer attachments=\{\[evidenceViewer\.attachment\]\} resolveAttachmentUrl=\{resolveEvidenceUrl\}/);
  assert.match(text, /Ver documento/);
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

test('confirmed Custom Quotation work refreshes the parent group without a browser reload', () => {
  const text = workspace();
  assert.match(text, /async function refreshSelectedGroup\(sourceId: string\)/);
  assert.match(text, /listCustomQuotationOperationsGroups\(\{ page, search: search \|\| undefined \}\)/);
  assert.match(text, /setSelectedGroup\(\(current\) => current\?\.sourceId === sourceId \? response\.items\.find\(\(item\) => item\.sourceId === sourceId\) \?\? current : current\)/);
  assert.match(text, /onChanged=\{\(\) => refreshSelectedGroup\(selectedGroup\.sourceId\)\}/);
  assert.match(text, /onClose=\{\(\) => setSelectedRequirement\(null\)\} onChanged=\{onChanged\}/);
  assert.match(text, /await transitionStandaloneOperationalFulfillment\(requirementId, confirmationFulfillment\.id, 'CONFIRMED'\);\s*setConfirmationFulfillment\(null\); setConfirmationReference\(''\);\s*await load\(\); await onChanged\(\);/);
});

test('Custom Quotation history is terminal, read-only, and delegates filters to the backend', () => {
  const text = workspace();
  const apiText = api();
  const historyStart = text.indexOf('function CustomQuotationHistory()');
  const historyEnd = text.indexOf('function CustomQuotationGroupDetail');
  const history = text.slice(historyStart, historyEnd);
  assert.ok(historyStart >= 0 && historyEnd > historyStart, 'history is isolated from active workflow controls');
  assert.match(text, /Activas/);
  assert.match(text, /Historial/);
  assert.match(history, /listCustomQuotationOperationsHistory/);
  assert.match(apiText, /custom-quotation-history/);
  assert.match(apiText, /dateAuthority: 'FULFILLMENT_FINALIZED_AT'/);
  for (const preset of ['TODAY', 'LAST_7_DAYS', 'LAST_15_DAYS', 'LAST_MONTH', 'CUSTOM']) assert.match(history, new RegExp(preset));
  assert.match(history, /datePreset: datePreset \|\| undefined/);
  assert.match(history, /dateFrom: datePreset === 'CUSTOM' \? dateFrom \|\| undefined : undefined/);
  assert.match(history, /dateTo: datePreset === 'CUSTOM' \? dateTo \|\| undefined : undefined/);
  assert.match(history, /item\.finalStatus/);
  assert.match(history, /historyStatusLabel/);
  assert.match(history, /getStandaloneOperationalEvidenceAccess\(item\.requirementId, item\.fulfillmentId, attachment\.id\)/);
  assert.match(history, /Ver documento fiscal/);
  assert.match(history, /formatDateTime\(item\.finalizedAt\)/);
  assert.match(history, /money\(item\.purchase\.amount, item\.purchase\.currency\)/);
  for (const forbidden of ['Registrar compra', 'Confirmar', 'Editar compra', 'cancelStandalone', 'createStandalone']) assert.doesNotMatch(history, new RegExp(forbidden));
});
