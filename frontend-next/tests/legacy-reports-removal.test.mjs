import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const legacyReportsPath = ["/billing", "admin", "reports"].join("/");
const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("ADMIN navigation has one Reporting destination and no legacy Reports route", () => {
  const header = source("../src/components/app-shell-header.tsx");
  const nav = source("../src/components/vertical-nav.tsx");

  assert.match(header, /\{ href: "\/reports", label: "Reportes" \}/);
  assert.match(nav, /href: "\/reports",\s*label: "Reportes"/);
  assert.doesNotMatch(header, new RegExp(legacyReportsPath));
  assert.doesNotMatch(nav, new RegExp(legacyReportsPath));
});

test("legacy ADMIN redirects point to the Reporting module", () => {
  const contracts = source("../src/app/contracts/page.tsx");
  const internalTripBooking = source("../src/app/internal-trips/[id]/book/page.tsx");

  assert.match(contracts, /role.*=== "ADMIN"[\s\S]{0,160}router\.replace\("\/reports"\)/);
  assert.match(internalTripBooking, /role.*=== "ADMIN"[\s\S]{0,160}router\.replace\("\/reports"\)/);
  assert.doesNotMatch(contracts, new RegExp(legacyReportsPath));
  assert.doesNotMatch(internalTripBooking, new RegExp(legacyReportsPath));
});

test("obsolete Reports frontend route is absent", () => {
  const obsoleteRoute = new URL(`../src/app${legacyReportsPath}`, import.meta.url);
  assert.equal(existsSync(obsoleteRoute), false);
});
