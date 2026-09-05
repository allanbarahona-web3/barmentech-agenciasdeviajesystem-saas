import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatFinancePaymentMethod } from "../src/lib/finance-payment-methods.ts";

test("Finance payment read labels use Spanish labels and preserve unknown values", () => {
  assert.equal(formatFinancePaymentMethod("CASH"), "Efectivo");
  assert.equal(formatFinancePaymentMethod("CARD"), "Tarjeta");
  assert.equal(formatFinancePaymentMethod("UNKNOWN_METHOD"), "UNKNOWN_METHOD");
});

test("payment history uses the shared payment-method formatter", () => {
  const paymentsView = readFileSync(
    new URL("../src/app/finance/accounts-receivable/payments-view.tsx", import.meta.url),
    "utf8",
  );

  assert.match(paymentsView, /formatFinancePaymentMethod\(payment\.paymentMethod\)/);
});
