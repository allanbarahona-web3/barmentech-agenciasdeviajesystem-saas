import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveArchivePaymentTerms } from "../src/features/contracts-form/commercial-terms.ts";

test("CASH explicitly archives without an active credit due date", () => {
  assert.deepEqual(resolveArchivePaymentTerms("CASH", "2026-10-15"), {
    ok: true,
    paymentConditionType: "CASH",
    paymentDueDate: null,
  });
});

test("CREDIT preserves the existing YYYY-MM-DD payment due date", () => {
  assert.deepEqual(resolveArchivePaymentTerms("CREDIT", "2026-10-15"), {
    ok: true,
    paymentConditionType: "CREDIT",
    paymentDueDate: "2026-10-15",
  });
});

test("CREDIT requires a valid payment due date", () => {
  assert.deepEqual(resolveArchivePaymentTerms("CREDIT", "2026-02-30"), {
    ok: false,
    message: "Para crédito, indique una fecha límite de pago válida.",
  });
});

test("payment condition remains an explicit choice independent from payment frequency", () => {
  assert.deepEqual(resolveArchivePaymentTerms(null, "2026-10-15"), {
    ok: false,
    message: "Seleccione una condición de pago: contado o crédito.",
  });
});

test("an invalid rehydrated payment condition cannot be archived", () => {
  assert.deepEqual(resolveArchivePaymentTerms("INSTALLMENTS", "2026-10-15"), {
    ok: false,
    message: "Seleccione una condición de pago: contado o crédito.",
  });
});

test("archive request sends only the new top-level payment condition alongside its existing payload", () => {
  const apiSource = readFileSync(new URL("../src/lib/contracts-api.ts", import.meta.url), "utf8");
  const wizardSource = readFileSync(
    new URL("../src/features/contracts-form/wizard/ContractsWizard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(apiSource, /paymentConditionType: "CASH" \| "CREDIT"/);
  assert.match(apiSource, /formData\.append\("paymentConditionType", input\.paymentConditionType\)/);
  assert.match(apiSource, /formData\.append\("payloadJson", input\.payloadJson\)/);
  assert.match(wizardSource, /paymentDueDate: archivePaymentTerms\.paymentDueDate \|\| ""/);
  assert.match(wizardSource, /paymentConditionType: archivePaymentTerms\.paymentConditionType/);
});
