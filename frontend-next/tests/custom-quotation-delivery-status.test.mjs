import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../src/lib/custom-quotations-api.ts', import.meta.url), 'utf8');
const proposalTab = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationProposalTab.tsx', import.meta.url), 'utf8');
const publicApproval = readFileSync(new URL('../src/app/custom-quotation-approval/[token]/page.tsx', import.meta.url), 'utf8');

function sourceBetween(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}

test('el contrato interno incluye sólo el resumen durable y comercialmente seguro de entrega', () => {
  assert.match(api, /export type CustomQuotationDeliverySummary = \{ sentAt: string; recipientEmail: string \}/);
  assert.match(api, /delivery: CustomQuotationDeliverySummary \| null/);
  assert.match(api, /CustomQuotationProposalDocument = \{[\s\S]*delivery: CustomQuotationDeliverySummary \| null/);
  assert.doesNotMatch(api, /providerMessageId|emailId|recipientOverride|approvalToken/);
});

test('Cotización representa la entrega persistida con email y hora del tenant', () => {
  assert.match(proposalTab, /const hasConfirmedDelivery = Boolean\(version\.delivery\) && !deliveryRefreshError/);
  assert.match(proposalTab, /hasConfirmedDelivery && version\.delivery \? <Alert className="mt-5" variant="success" role="status">/);
  assert.match(proposalTab, /<AlertTitle>Enviada por correo<\/AlertTitle>/);
  assert.match(proposalTab, /version\.delivery\.recipientEmail/);
  assert.match(proposalTab, /formatTenantDateTime\(version\.delivery\.sentAt\)/);
  assert.doesNotMatch(proposalTab, /quotation\.target\?\.email[\s\S]{0,300}Enviada por correo/);
});

test('sin entrega persistida no se afirma un envío y se mantiene la acción elegible', () => {
  assert.match(proposalTab, /hasConfirmedDelivery && version\.delivery \? <Alert/);
  assert.match(proposalTab, /hasConfirmedDelivery \? 'Reenviar por correo' : 'Enviar por correo'/);
  assert.match(proposalTab, /version\.status === 'ISSUED'/);
});

test('enviar y reenviar refrescan una vez la versión durable sin recargar la propuesta', () => {
  const send = sourceBetween(proposalTab, 'async function sendProposal()', 'async function submitManualDecision()');
  assert.match(send, /await sendCustomQuotationProposal\(quotation\.id, version\.versionId\)/);
  assert.match(send, /const refreshed = await refreshVersion\(\)/);
  assert.match(send, /setDeliveryRefreshError\(/);
  assert.doesNotMatch(send, /loadProposal|getLatestCustomQuotationVersion/);
  assert.match(proposalTab, /const latestRequestRef = useRef<Promise<CustomQuotationVersion> \| null>\(null\)/);
  assert.match(proposalTab, /const proposalCacheRef = useRef\(new Map<string, CustomQuotationProposalDocument \| null>\(\)\)/);
  assert.doesNotMatch(proposalTab, /setInterval|setTimeout\(/);
});

test('el estado de entrega queda dentro del workspace interno, sin tokens ni historial', () => {
  assert.doesNotMatch(publicApproval, /Enviada por correo|Reenviar por correo|delivery/);
  assert.doesNotMatch(proposalTab, /approvalToken|approvalUrl|publicUrl|recipientOverride|deliveryHistory|resendHistory/);
});
