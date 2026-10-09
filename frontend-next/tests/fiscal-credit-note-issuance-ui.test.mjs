import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(
  new URL('../src/app/fiscal-billing/documents/[billingDocumentId]/page.tsx', import.meta.url),
  'utf8',
);
const invoiceDetail = readFileSync(
  new URL('../src/app/fiscal-billing/invoices/[billingDocumentId]/page.tsx', import.meta.url),
  'utf8',
);

test('type-03 workspace renders persisted credit-note review context', () => {
  assert.match(workspace, /function creditNote\(w:BillingDocumentWorkspace\)\{return w\.documentTypeCode==='03';\}/);
  assert.match(workspace, /Nota de crédito electrónica/);
  assert.match(workspace, /Revisión de la nota de crédito/);
  assert.match(workspace, /creditReference\?\.externalDocumentNumber/);
  assert.match(workspace, /creditReference\?\.externalDocumentKey/);
  assert.match(workspace, /creditReference\.reasonCode/);
  assert.match(workspace, /Líneas acreditadas/);
  assert.match(workspace, /Totales acreditados persistidos/);
  assert.match(workspace, /Receptor de la nota de crédito/);
});

test('only existing fiscal write roles may issue, with a type-03-specific draft action', () => {
  assert.match(workspace, /if\(r!=='ADMIN'&&r!=='FACTURACION_COBROS'\)/);
  assert.match(workspace, /isEligible&&<Button[\s\S]*isCreditNote\?'Emitir nota de crédito':'Solicitar emisión electrónica'/);
  assert.match(workspace, /function eligible\(w:BillingDocumentWorkspace\)\{return w\.lifecycleStatus==='DRAFT'/);
  assert.doesNotMatch(workspace, /r==='CONTADOR'|r==='OPERACIONES'|r==='AGENT'/);
});

test('type-03 issuance remains explicitly confirmed and reuses the generic request path', () => {
  assert.match(workspace, /onClick=\{\(\)=>setConfirming\(true\)\}/);
  assert.match(workspace, /title=\{isCreditNote\?'Emitir nota de crédito':'Solicitar emisión electrónica'\}/);
  assert.match(workspace, /Esta nota de crédito será enviada a Hacienda\. ¿Desea continuar\?/);
  assert.match(workspace, /onConfirm=\{\(\)=>void issue\(\)\}/);
  assert.match(workspace, /async function issue\(\)[\s\S]*requestBillingDocumentElectronicIssuance\(id\)/);
  assert.doesNotMatch(workspace, /useEffect\([^\n]*requestBillingDocumentElectronicIssuance/);
});

test('the existing generic refresh and lifecycle monitoring paths remain intact', () => {
  assert.match(workspace, /const fresh=await refresh\(false\);if\(fresh&&active\(fresh\)\)/);
  assert.match(workspace, /useEffect\(\(\)=>\{if\(!workspace\|\|!active\(workspace\)/);
  assert.match(workspace, /w\.taxAuthorityStatus==='ACCEPTED'/);
  assert.match(workspace, /w\.taxAuthorityStatus==='REJECTED'/);
  assert.match(workspace, /w\.providerStatus==='FAILED'/);
  assert.match(workspace, /Ver nota de crédito/);
});

test('01 and 04 retain generic issuance presentation while accepted type-03 documents reach existing artifacts', () => {
  assert.match(workspace, /isCreditNote\?'Emitir nota de crédito':'Solicitar emisión electrónica'/);
  assert.match(workspace, /isCreditNote\?'Nota de crédito electrónica':'Workspace fiscal · Snapshot persistido'/);
  assert.match(workspace, /\/fiscal-billing\/invoices\/\$\{encodeURIComponent\(w\.id\)\}/);
  assert.match(invoiceDetail, /'03': 'Nota de crédito electrónica'/);
});
