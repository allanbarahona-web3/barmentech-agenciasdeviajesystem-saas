import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const context = () => read('../src/components/operations/passenger-operational-context.tsx');
const api = () => read('../src/lib/operations-api.ts');
const reservation = () => read('../src/components/operations/operational-fulfillments-workspace.tsx');
const purchaseDrawer = () => read('../src/components/operations/operational-purchase-drawer.tsx');

test('the one normalized passenger context renders all selected-detail passengers and humanizes age context', () => {
  const source = context();
  assert.match(source, /passengerContexts: PassengerOperationalContextValue\[\]/);
  assert.match(source, /contexts\.map/);
  assert.match(source, /Nacimiento:/);
  assert.match(source, /SERVICE_DATE: 'Edad al servicio'/);
  assert.match(source, /TRIP_DEPARTURE: 'Edad al inicio del viaje'/);
  assert.match(source, /CURRENT_DATE: 'Edad actual'/);
  assert.match(source, /context\.dateOfBirth \?/);
  assert.match(source, /context\.age !== null/);
  assert.match(source, /formatDateOnly/);
});

test('reservation and every shared purchase entry use the same context without changing operational submit behavior', () => {
  const reservationSource = reservation();
  const drawer = purchaseDrawer();
  const standalone = read('../src/components/operations/standalone-operational-requirements-workspace.tsx');
  const purchasesEvidence = read('../src/components/operations/operational-purchases-evidence-workspace.tsx');
  assert.match(reservationSource, /<PassengerOperationalContext requirementId=\{requirementId\} passengerContexts=\{editing\?\.passengerContexts \?\? requirement\?\.passengerContexts\}/);
  assert.match(drawer, /<PassengerOperationalContext requirementId=\{requirementId\} passengerContexts=\{passengerContexts\}/);
  assert.match(reservationSource, /ensureOperationalFulfillment\(travelPackageId, requirementId, \[\.\.\.selected\]\)/);
  assert.match(drawer, /await createOperationalPurchase\(travelPackageId, requirementId, effectiveFulfillmentId, input\)/);
  assert.match(drawer, /await createStandaloneOperationalPurchase\(requirementId, effectiveFulfillmentId, input\)/);
  assert.match(standalone, /passengerContexts=\{purchaseFulfillment\?\.passengerContexts \?\? requirement\.passengerContexts\}/);
  assert.match(purchasesEvidence, /passengerContexts=\{fulfillment\?\.passengerContexts \?\? requirement\?\.passengerContexts\}/);
});

test('identification metadata and signed access remain explicitly lazy and requirement-scoped', () => {
  const source = context();
  const client = api();
  assert.match(source, /onClick=\{\(\) => void openDocuments\(\)\}/);
  assert.match(source, /const \[documentGroups, setDocumentGroups\] = useState/);
  assert.match(source, /if \(documentGroups\) return/);
  assert.match(source, /await listOperationalPassengerDocuments\(requirementId\)/);
  assert.match(source, /getOperationalPassengerDocumentAccess\(requirementId, attachment\.id\)/);
  assert.match(source, /AttachmentViewer attachments=\{\[viewerAttachment\]\} resolveAttachmentUrl=\{resolveDocumentUrl\}/);
  assert.match(client, /\/operations\/requirements\/\$\{encodeURIComponent\(requirementId\)\}\/passenger-documents/);
  assert.match(client, /passenger-documents\/\$\{encodeURIComponent\(documentId\)\}\/url/);
  assert.doesNotMatch(source, /useEffect\(/);
  assert.doesNotMatch(source + client, /objectKey|storage path|bucket/i);
});

test('document labels, empty and error states preserve operational form state and expose no raw backend errors', () => {
  const source = context();
  assert.match(source, /ID_FRONT: 'Identificación — frente'/);
  assert.match(source, /ID_BACK: 'Identificación — reverso'/);
  assert.match(source, /PASSPORT: 'Pasaporte'/);
  assert.match(source, /No hay identificación o pasaporte disponible para este pasajero\./);
  assert.match(source, /No se pudo cargar la identificación o el pasaporte\. Inténtelo de nuevo\./);
  assert.match(source, /No se pudo abrir el documento\. Inténtelo de nuevo\./);
  assert.match(source, /onClose=\{\(\) => setViewerAttachment\(null\)\}/);
  assert.doesNotMatch(source, /router\.|window\.location|href=/);
});

test('passenger context and document APIs are detail-only, not added to Operations list rows', () => {
  const client = api();
  const standalone = read('../src/components/operations/standalone-operational-requirements-workspace.tsx');
  const requirementSummary = client.slice(client.indexOf('export interface OperationalRequirementSummary'), client.indexOf('export interface OperationalRequirementDetail'));
  const fulfillmentSummary = client.slice(client.indexOf('export interface OperationalFulfillmentSummary'), client.indexOf('export interface OperationalFulfillmentDetail'));
  assert.match(client, /export interface OperationalRequirementDetail[\s\S]*passengerContexts/);
  assert.match(client, /export interface OperationalFulfillmentDetail[\s\S]*passengerContexts/);
  assert.doesNotMatch(requirementSummary, /passengerContexts/);
  assert.doesNotMatch(fulfillmentSummary, /passengerContexts/);
  assert.doesNotMatch(standalone, /listOperationalPassengerDocuments/);
});
