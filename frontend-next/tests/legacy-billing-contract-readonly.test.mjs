import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("legacy contract billing keeps historical reads while removing payment and receipt mutations", () => {
  const page = source("../src/app/billing/[contractId]/page.tsx");
  const api = source("../src/lib/billing-api.ts");

  assert.match(page, /getBillingContractAccount/);
  assert.match(page, /getBillingReceiptPdfUrl/);
  assert.match(page, /payment\.attachments/);
  assert.match(page, /PDF recibo/);
  assert.doesNotMatch(page, /Generar abono/);
  assert.doesNotMatch(page, /Aprobar banco \(manual\)/);
  assert.doesNotMatch(page, /Confirmar rechazo/);
  assert.doesNotMatch(page, /onShareReceiptWhatsApp/);
  assert.doesNotMatch(page, /approveAndSendBillingReceipt/);
  assert.doesNotMatch(page, /reportBillingPayment/);
  assert.doesNotMatch(page, /verifyBillingPayment/);
  assert.doesNotMatch(page, /rejectBillingPayment/);

  assert.match(api, /getBillingContractAccount/);
  assert.match(api, /getBillingReceiptPdfUrl/);
  assert.doesNotMatch(api, /reportBillingPayment/);
  assert.doesNotMatch(api, /markBillingPaymentInReview/);
  assert.doesNotMatch(api, /verifyBillingPayment/);
  assert.doesNotMatch(api, /rejectBillingPayment/);
  assert.doesNotMatch(api, /approveAndSendBillingReceipt/);
});
