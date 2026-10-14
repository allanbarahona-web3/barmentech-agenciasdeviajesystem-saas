import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("retires the legacy Billing contract-account pages and client surface", () => {
  assert.equal(existsSync(new URL("../src/app/billing/page.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/app/billing/[contractId]/page.tsx", import.meta.url)), false);

  const api = source("../src/lib/billing-api.ts");
  for (const endpointClient of [
    "listBillingContracts",
    "getBillingContractAccount",
    "getBillingInvoicePdfUrl",
    "getBillingAccountStatementPdfUrl",
    "getBillingReceiptPdfUrl",
    "getBillingCreditNotePdfUrl",
    "sendBillingAccountStatementEmail",
    "sendBillingCreditNoteEmail",
  ]) {
    assert.doesNotMatch(api, new RegExp(endpointClient));
  }
});

test("removes retired Estados de cuenta navigation and redirects to existing Finance work", () => {
  const nav = source("../src/components/vertical-nav.tsx");
  const header = source("../src/components/app-shell-header.tsx");
  const agentStart = source("../src/app/agent-start/page.tsx");
  const agentDashboard = source("../src/app/agent-dashboard/page.tsx");

  for (const value of [nav, header, agentStart, agentDashboard]) {
    assert.doesNotMatch(value, /href: "\/billing"/);
    assert.doesNotMatch(value, /router\.replace\("\/billing"/);
  }
  assert.match(header, /href: "\/admin\/pending-payments"/);
  assert.match(agentStart, /getHomeRouteForRole\(role\)/);
  assert.match(agentDashboard, /getHomeRouteForRole\(role\)/);
});
