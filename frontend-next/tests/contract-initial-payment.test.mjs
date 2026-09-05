import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FINANCE_PAYMENT_METHOD_OPTIONS } from "../src/lib/finance-payment-methods.ts";

const resolverSource = readFileSync(
  new URL("../src/features/contracts-form/initial-contract-payment.ts", import.meta.url),
  "utf8",
);

test("uses the six Finance payment-method tokens and Contract labels", () => {
  assert.deepEqual(FINANCE_PAYMENT_METHOD_OPTIONS, [
    { token: "CASH", label: "Efectivo" },
    { token: "BANK_TRANSFER", label: "Transferencia bancaria" },
    { token: "CARD", label: "Tarjeta" },
    { token: "CHECK", label: "Cheque" },
    { token: "MOBILE_TRANSFER", label: "SINPE Móvil" },
    { token: "OTHER", label: "Otro" },
  ]);
});

test("CASH resolver preserves its method and serializes any reservation as zero", () => {
  assert.match(resolverSource, /paymentConditionType === "CASH"/);
  assert.match(resolverSource, /paymentMethod: input\.paymentMethod, reservationAmount: "0"/);
});

test("initial-payment resolver requires an explicit Finance payment method", () => {
  assert.match(resolverSource, /!isFinancePaymentMethod\(input\.paymentMethod\)/);
  assert.match(resolverSource, /Seleccione un método de pago/);
});

test("CREDIT resolver preserves its reservation and selected payment method", () => {
  assert.match(resolverSource, /paymentMethod: input\.paymentMethod, reservationAmount: input\.reservationAmount/);
});

test("CREDIT resolver rejects missing, zero, and total-or-greater reservations", () => {
  assert.match(resolverSource, /reservation <= 0/);
  assert.match(resolverSource, /reservation >= total/);
  assert.match(resolverSource, /monto de reserva mayor que cero/);
  assert.match(resolverSource, /reserva debe ser menor que el monto total/);
});

test("Contract UI and archive request expose the shared Finance method field", () => {
  const travelStep = readFileSync(new URL("../src/features/contracts-form/wizard/steps/travel/TravelStep.tsx", import.meta.url), "utf8");
  const wizard = readFileSync(new URL("../src/features/contracts-form/wizard/ContractsWizard.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../src/lib/contracts-api.ts", import.meta.url), "utf8");

  assert.match(travelStep, /Método de pago de la reserva/);
  assert.match(travelStep, /FINANCE_PAYMENT_METHOD_OPTIONS/);
  assert.match(travelStep, /\{isCredit \? \(/);
  assert.match(travelStep, /\{isCash \? \(/);
  assert.match(wizard, /resolveArchiveInitialPayment/);
  assert.match(wizard, /reservationAmount: archiveInitialPayment\.reservationAmount/);
  assert.match(wizard, /paymentMethod: archiveInitialPayment\.paymentMethod/);
  assert.match(api, /paymentMethod: FinancePaymentMethod/);
  assert.match(api, /formData\.append\("paymentMethod", input\.paymentMethod\)/);
  assert.match(readFileSync(new URL("../src/features/contracts-form/utils.ts", import.meta.url), "utf8"), /const balance = Number\.isFinite\(total\) && Number\.isFinite\(reservation\) \? total - reservation/);
});
