import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatTenantDateTimeInput,
  tenantDateTimeInputToUtc,
} from "../src/shared/regional/business-date.ts";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const paymentFlowSource = read("app/finance/accounts-receivable/payment-flow.tsx");
const intakeSource = read("features/finance/customer-invoice-payment-intake-sheet.tsx");

test("payment datetime-local values represent the same tenant instant across browser timezones", () => {
  const instant = "2026-09-20T05:30:00.000Z";
  const previousTimeZone = process.env.TZ;
  const evaluate = (browserTimeZone) => {
    process.env.TZ = browserTimeZone;
    return {
      costaRica: formatTenantDateTimeInput(instant, "America/Costa_Rica"),
      peru: formatTenantDateTimeInput(instant, "America/Lima"),
      costaRicaUtc: tenantDateTimeInputToUtc("2026-09-19T23:30", "America/Costa_Rica"),
      peruUtc: tenantDateTimeInputToUtc("2026-09-20T00:30", "America/Lima"),
    };
  };

  try {
    assert.deepEqual(evaluate("UTC"), evaluate("Pacific/Auckland"));
    assert.deepEqual(evaluate("UTC"), evaluate("America/New_York"));
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }

  assert.equal(formatTenantDateTimeInput(instant, "America/Costa_Rica"), "2026-09-19T23:30");
  assert.equal(formatTenantDateTimeInput(instant, "America/Lima"), "2026-09-20T00:30");
  assert.equal(tenantDateTimeInputToUtc("2026-09-19T23:30", "America/Costa_Rica"), instant);
  assert.equal(tenantDateTimeInputToUtc("2026-09-20T00:30", "America/Lima"), instant);
});

test("Accounts Receivable waits for tenant regional loading and preserves the UTC instant contract", () => {
  assert.match(paymentFlowSource, /const \{ timeZone, isConfigured \} = useTenantRegional\(\)/);
  assert.match(paymentFlowSource, /if \(!isConfigured\) return null/);
  assert.match(paymentFlowSource, /formatTenantDateTimeInput\(new Date\(\)\.toISOString\(\), timeZone\)/);
  assert.match(paymentFlowSource, /tenantDateTimeInputToUtc\(receivedAt, timeZone\)/);
  assert.match(paymentFlowSource, /receivedAt: receivedAtUtc/);
  assert.doesNotMatch(paymentFlowSource, /new Date\(receivedAt\)\.toISOString\(\)/);
  assert.match(paymentFlowSource, /receivedAtTimeZoneRef\.current !== timeZone/);
});

test("reported payment intake keeps the date-only payload and uses shared display formatters", () => {
  assert.match(intakeSource, /type="date" value=\{form\.paymentDate\}/);
  assert.match(intakeSource, /paymentDate: form\.paymentDate \|\| undefined/);
  assert.match(intakeSource, /formatTenantDateTime\(target\.issuedAt\)/);
  assert.match(intakeSource, /formatBusinessDate\(preview\.exchangeRateEffectiveDate\)/);
  assert.match(intakeSource, /isCalendarDate\(value\)/);
  assert.doesNotMatch(intakeSource, /new Date\(target\.issuedAt\)\.toLocaleDateString/);
  assert.doesNotMatch(intakeSource, /new Date\(`\$\{preview\.exchangeRateEffectiveDate\}T00:00:00`\)\.toLocaleDateString/);
});
