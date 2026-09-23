import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../src/lib/custom-quotations-api.ts', import.meta.url), 'utf8');
const proposalTab = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationProposalTab.tsx', import.meta.url), 'utf8');
const completion = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationSalesOrderCompletion.tsx', import.meta.url), 'utf8');
const publicApproval = readFileSync(new URL('../src/app/custom-quotation-approval/[token]/page.tsx', import.meta.url), 'utf8');

test('la aprobación manual usa únicamente los endpoints internos autenticados sin autoridad comercial del cliente', () => {
  assert.match(api, /acceptCustomQuotationVersion.*\/versions\/\$\{encodeURIComponent\(versionId\)\}\/accept.*'POST'/);
  assert.match(api, /rejectCustomQuotationVersion.*\/versions\/\$\{encodeURIComponent\(versionId\)\}\/reject.*'POST'/);
  assert.doesNotMatch(api, /acceptCustomQuotationVersion[\s\S]{0,220}(finalSellingPrice|currency|fiscal|recipient|tenantId|body:)/i);
  assert.doesNotMatch(api, /rejectCustomQuotationVersion[\s\S]{0,220}(finalSellingPrice|currency|fiscal|recipient|tenantId|body:)/i);
});

test('una versión emitida muestra una sección interna de aprobación y confirmaciones seguras', () => {
  assert.match(proposalTab, /const manualApprovalAvailable = quotation\.status === 'ISSUED' && version\.status === 'ISSUED'/);
  assert.match(proposalTab, /title="Aprobación"/);
  assert.match(proposalTab, /Registra aquí la decisión del cliente si la confirmación se recibió por otro medio/);
  assert.match(proposalTab, /Aceptar manualmente/);
  assert.match(proposalTab, /Rechazar manualmente/);
  assert.match(proposalTab, /Confirmar aceptación/);
  assert.match(proposalTab, /Esta acción registra formalmente la aceptación del cliente/);
  assert.match(proposalTab, /Confirmar rechazo/);
  assert.match(proposalTab, /variant="success" onClick=\{\(\) => setManualDecision\('ACCEPT'\)\}/);
  assert.match(proposalTab, /variant=\{manualDecision === 'REJECT' \? 'destructive' : 'success'\}/);
});

test('la transición manual evita duplicados, refresca autoridad y trata una carrera como actualización de estado', () => {
  assert.match(proposalTab, /disabled=\{manualTransitionPending\}/);
  assert.match(proposalTab, /LoaderCircle[\s\S]{0,120}Registrando…/);
  assert.match(proposalTab, /await acceptCustomQuotationVersion\(quotation\.id, version\.versionId\)/);
  assert.match(proposalTab, /await rejectCustomQuotationVersion\(quotation\.id, version\.versionId\)/);
  assert.match(proposalTab, /await onQuotationRefreshed\(\)/);
  assert.match(proposalTab, /if \(approvalStateChanged\(requestError\)\)/);
  assert.match(proposalTab, /INVALID_TRANSITION/);
  assert.match(proposalTab, /TRANSITION_CONFLICT/);
});

test('los estados terminales eliminan controles manuales y conservan los flujos internos ya existentes', () => {
  assert.match(proposalTab, /quotation\.status === 'ACCEPTED'.*CustomQuotationSalesOrderCompletion/s);
  assert.match(proposalTab, /Cotización rechazada/);
  assert.match(completion, /const isAccepted = quotation\.status === 'ACCEPTED'/);
  assert.doesNotMatch(publicApproval, /Aceptar manualmente|Rechazar manualmente|Crear orden de venta|Orden de venta creada/);
});
