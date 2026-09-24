import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const button = readFileSync(new URL('../src/components/ui/button.tsx', import.meta.url), 'utf8');
const publicApproval = readFileSync(new URL('../src/app/custom-quotation-approval/[token]/page.tsx', import.meta.url), 'utf8');
const proposalTab = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationProposalTab.tsx', import.meta.url), 'utf8');
const salesOrder = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationSalesOrderCompletion.tsx', import.meta.url), 'utf8');

test('la variante positiva compartida usa el token semántico success', () => {
  assert.match(button, /success: "bg-success text-white hover:bg-success\/90"/);
});

test('la aprobación pública aplica éxito a aceptar y destructive a rechazar', () => {
  assert.match(publicApproval, /setDecision\('ACCEPT'\).*variant="success"/s);
  assert.match(publicApproval, /setDecision\('REJECT'\).*variant="destructive"/s);
  assert.match(publicApproval, /variant=\{decision === 'REJECT' \? 'destructive' : 'success'\}/);
  assert.match(publicApproval, /proposal\.status === 'REJECTED' \? 'destructive'/);
});

test('la emisión conserva su alerta inmediata y la entrega muestra estado persistido separado', () => {
  assert.match(proposalTab, /issueMessage && quotation\.status === 'ISSUED' \? <Alert variant="success" role="status"/);
  assert.match(proposalTab, /<AlertTitle>Cotización emitida<\/AlertTitle>/);
  assert.match(proposalTab, /quedó registrada como una versión inmutable/);
  assert.match(proposalTab, /<Alert variant="success" role="status"><CheckCircle2[\s\S]{0,160}<AlertTitle>Cotización enviada<\/AlertTitle>/);
  assert.match(proposalTab, /hasConfirmedDelivery && version\.delivery \? <Alert className="mt-5" variant="success" role="status">/);
  assert.match(proposalTab, /<AlertTitle>Enviada por correo<\/AlertTitle>/);
  assert.match(proposalTab, /version\.delivery\.recipientEmail/);
  assert.match(proposalTab, /formatTenantDateTime\(version\.delivery\.sentAt\)/);
  assert.match(proposalTab, /setDeliveryMessage\(null\)/);
});

test('la conversión y la orden conservan una sola confirmación fuerte por resultado', () => {
  assert.match(salesOrder, /<Alert variant="success" role="status"><CheckCircle2[\s\S]{0,100}<AlertTitle>Cliente completado<\/AlertTitle>/);
  assert.match(salesOrder, /El prospecto fue convertido correctamente en cliente/);
  assert.match(salesOrder, /<Alert variant="success" role="status"><CheckCircle2[\s\S]{0,100}<AlertTitle>Orden de venta creada<\/AlertTitle>/);
  assert.doesNotMatch(salesOrder, /setMessage\(|Orden de venta creada correctamente\./);
});
