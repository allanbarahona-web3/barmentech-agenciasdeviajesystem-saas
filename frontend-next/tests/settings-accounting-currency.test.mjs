import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../src/", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const settings = read("app/settings/page.tsx");
const api = read("lib/auth-api.ts");

test("Settings reads and displays the nullable accounting/reporting currency", () => {
  assert.match(settings, /Moneda contable \/ de reportes/);
  assert.match(settings, /Moneda utilizada para consolidar reportes financieros y contables\./);
  assert.match(settings, /data\.accountingCurrencyCode \|\| ""/);
  assert.match(settings, /Sin configurar\. Algunos reportes contables/);
  assert.match(api, /accountingCurrencyCode: string \| null/);
});

test("Settings uppercases and validates accounting currency before its existing save", () => {
  assert.match(settings, /setAccountingCurrencyCode\(event\.target\.value\.toUpperCase\(\)\)/);
  assert.match(settings, /!\/\^\[A-Z\]\{3\}\$\/\.test\(normalizedAccountingCurrencyCode\)/);
  assert.match(settings, /La moneda contable debe tener exactamente 3 letras mayúsculas\./);
  assert.match(settings, /accountingCurrencyCode: normalizedAccountingCurrencyCode \|\| null/);
  assert.match(settings, /updateTenantConfigAdmin\(\{/);
});

test("Settings leaves fiscal document default and exchange-rate source outside this save payload", () => {
  const save = settings.slice(settings.indexOf("await updateTenantConfigAdmin({"), settings.indexOf("// Recargar config"));
  assert.doesNotMatch(save, /defaultCurrencyCode/);
  assert.doesNotMatch(save, /exchangeRateSource/);
  assert.doesNotMatch(settings, /\/admin\/fiscal-billing|\/admin\/exchange-rate/);
});

test("Settings retains ADMIN-only client access behavior", () => {
  assert.match(settings, /session\.user\.role !== "ADMIN"/);
});
