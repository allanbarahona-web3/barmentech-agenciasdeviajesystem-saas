import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatBusinessDateTime } from "../src/shared/regional/business-date.ts";

const historySource = readFileSync(
  new URL("../src/app/history/page.tsx", import.meta.url),
  "utf8",
);
const billingAuditSource = readFileSync(
  new URL("../src/app/billing/audit/page.tsx", import.meta.url),
  "utf8",
);

const formatHistoryEvent = (event, timeZone) =>
  formatBusinessDateTime(event.createdAt, timeZone);

const formatBillingAuditEvent = (event, timeZone) => {
  const formatted = formatBusinessDateTime(event.createdAt, timeZone);
  if (formatted === "-") return "-";
  const seconds = new Date(event.createdAt).getUTCSeconds();
  return Number.isNaN(seconds)
    ? "-"
    : `${formatted}:${String(seconds).padStart(2, "0")}`;
};

test("contract history and billing audit event instants follow the tenant timezone", () => {
  const mockedEvent = { createdAt: "2026-11-06T05:30:00Z" };
  const previousTimeZone = process.env.TZ;

  try {
    process.env.TZ = "Pacific/Auckland";
    assert.equal(
      formatHistoryEvent(mockedEvent, "America/Costa_Rica"),
      "05/11/2026 23:30",
    );
    assert.equal(
      formatHistoryEvent(mockedEvent, "America/Lima"), "06/11/2026 00:30");
    assert.equal(
      formatBillingAuditEvent(mockedEvent, "America/Costa_Rica"),
      "05/11/2026 23:30:00",
    );
    assert.equal(
      formatBillingAuditEvent(mockedEvent, "America/Lima"), "06/11/2026 00:30:00");
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test("the active history rows use the shared tenant formatter without browser-local formatting", () => {
  for (const source of [historySource, billingAuditSource]) {
    assert.match(source, /useTenantDateTimeFormatter/);
    assert.doesNotMatch(source, /toLocaleString/);
  }

  assert.match(historySource, /formatTenantDateTime\(item\.createdAt\)/);
  assert.match(billingAuditSource, /formatAuditDateTime\(item\.createdAt\)/);
  assert.match(billingAuditSource, /getUTCSeconds\(\)/);
});
