import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const nav = source("../src/components/vertical-nav.tsx");
const dashboardPage = source("../src/app/admin/dashboard/page.tsx");
const financePage = source("../src/app/finance/accounts-receivable/page.tsx");

test("Finance workspace remains visible to CONTADOR and operational for FACTURACION_COBROS", () => {
  assert.match(nav, /isAdminOrContador \|\| role === "FACTURACION_COBROS"/);
  assert.match(nav, /href: "\/finance\/accounts-receivable"/);
  assert.match(financePage, /const READ_ROLES = new Set\(\['ADMIN', 'FACTURACION_COBROS', 'CONTADOR'\]\)/);
  assert.match(financePage, /const WRITE_ROLES = new Set\(\['ADMIN', 'FACTURACION_COBROS'\]\)/);
});

test("Dashboard remains ADMIN-only while legacy account navigation is absent", () => {
  assert.match(dashboardPage, /const authorized = role === "ADMIN"/);
  assert.doesNotMatch(nav, /href: "\/billing"/);
  assert.doesNotMatch(nav, /Estados de cuenta/);
});
