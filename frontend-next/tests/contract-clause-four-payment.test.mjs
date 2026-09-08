import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/features/documents/contract/contract-document.ts", import.meta.url),
  "utf8",
);

const clauseStart = source.indexOf('"CUARTO: PRECIO, FORMA DE PAGO Y MEDIOS DE PAGO."');
const clauseEnd = source.indexOf('"QUINTO: DEPÓSITO DE RESERVA E INCUMPLIMIENTO DE PAGOS."');
const clauseFour = source.slice(clauseStart, clauseEnd);
const cashBranch = clauseFour.slice(
  clauseFour.indexOf('state.paymentConditionType === "CASH"'),
  clauseFour.indexOf('    : `<ul>'),
);
const creditBranch = clauseFour.slice(clauseFour.indexOf('    : `<ul>'));

test("Clause Four renders CASH independently of stale credit-plan fields", () => {
  assert.match(cashBranch, /Precio total del Tour/);
  assert.match(cashBranch, /Forma de pago: contado\./);
  assert.doesNotMatch(
    cashBranch,
    /reservationAmount|balanceAmount|installmentCount|paymentFrequency|monthlyInstallmentAmount|lastInstallmentAmount|paymentDueDate/,
  );
});

test("Clause Four preserves the configured CREDIT payment-plan rendering", () => {
  assert.match(creditBranch, /Pago inicial \(reserva\)/);
  assert.match(creditBranch, /Saldo pendiente/);
  assert.match(creditBranch, /installmentCount/);
  assert.match(creditBranch, /paymentFrequency/);
  assert.match(creditBranch, /monthlyInstallmentAmount/);
  assert.match(creditBranch, /lastInstallmentAmount/);
  assert.match(creditBranch, /paymentDueDate/);
});
