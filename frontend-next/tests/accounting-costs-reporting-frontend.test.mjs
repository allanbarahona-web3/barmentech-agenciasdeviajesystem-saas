import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../src/", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const registry = read("features/reporting/report-registry.ts");
const page = read("features/reporting/accounting-costs/accounting-costs-page.tsx");
const report = read("features/reporting/accounting-costs/operational-costs-report.tsx");
const table = read("features/reporting/accounting-costs/accounting-costs-table.tsx");
const summary = read("features/reporting/accounting-costs/accounting-costs-summary.tsx");
const api = read("lib/accounting-costs-reporting-api.ts");

test("Costos reales is an ADMIN/CONTADOR report card and guarded route", () => {
  assert.match(registry, /key: "ACCOUNTING_COSTS"[\s\S]*?href: "\/reports\/accounting-costs"[\s\S]*?allowedRoles: \["ADMIN", "CONTADOR"\]/);
  assert.match(page, /<ReportRouteGuard reportKey="ACCOUNTING_COSTS">/);
  assert.doesNotMatch(registry, /ACCOUNTING_COSTS[\s\S]*?"AGENT"/);
});

test("only Operaciones requests backend; future tabs remain disabled", () => {
  const tabs = read("features/reporting/accounting-costs/accounting-costs-tabs.tsx");
  assert.match(report, /sourceType: "OPERATIONAL_PURCHASE"/);
  assert.match(api, /fetchApi\("\/reporting\/accounting-costs"/);
  assert.match(tabs, /Payroll · Próximamente/);
  assert.match(tabs, /Gastos · Próximamente/);
  assert.equal((tabs.match(/disabled/g) ?? []).length, 2);
});

test("monetary view defaults to original and derives its accounting label from the response", () => {
  assert.match(page, /useState<AccountingCostsMonetaryView>\("ORIGINAL"\)/);
  assert.match(page, /\{baseCurrency \?\? "Base"\}/);
  assert.doesNotMatch(page + report + table + summary, /"CRC"|\bCRC\b/);
  assert.match(report, /onBaseCurrencyChange\(next\.accountingCurrencyCode\)/);
  assert.match(api, /accountingCurrencyCode: string \| null/);
});

test("view changes only presentation and preserves server-backed original and base summaries", () => {
  assert.match(summary, /monetaryView === "ORIGINAL"/);
  assert.match(summary, /summaries\.byCurrency\.map/);
  assert.match(summary, /summaries\.baseByCurrency/);
  assert.match(summary, /missingConversionCount/);
  assert.match(table, /monetaryView === "ORIGINAL"/);
  assert.match(table, /row\.conversion\.subtotal/);
  assert.match(table, /row\.conversion\.tax/);
  assert.match(table, /row\.conversion\.total/);
  assert.doesNotMatch(page + report + table + summary, /multiply|divide|convertCurrency|exchangeRate\.times/);
});

test("base rows retain missing-FX diagnostics and compact original context", () => {
  assert.match(table, /TC no disponible/);
  assert.match(table, /Original: \$\{formatFinanceMoneyDisplay\(row\.total, row\.currency\)\}/);
  assert.match(table, /BCCR/);
  assert.match(table, /Manual/);
  assert.match(table, /Identidad/);
  assert.match(table, /Snapshot TC inválido/);
  assert.match(summary, /snapshot de TC inválido/);
});

test("Operaciones exports the server-generated full filtered result using the current monetary view", () => {
  assert.match(page, /setRefreshToken\(\(value\) => value \+ 1\)/);
  assert.match(report, /\[customIncomplete, filters, onBaseCurrencyChange, page, refreshToken\]/);
  assert.match(page, /<Link href="\/reports">Volver a reportes<\/Link>/);
  assert.match(table, /AccountingCostEvidenceDialog/);
  assert.match(api, /\/evidence/);
  assert.match(report, /downloadAccountingCostsExport/);
  assert.match(api, /"\/reporting\/accounting-costs\/export"/);
  assert.match(report, /projectionMode: monetaryView/);
  assert.match(report, /counterpartySearch: filters\.supplier/);
  assert.match(report, /servicePurposeCode: filters\.purpose/);
  assert.match(report, /status: filters\.status/);
  assert.match(report, /DropdownMenuItem onSelect=\{\(\) => void exportReport\("PDF"\)\}/);
  assert.match(report, /DropdownMenuItem onSelect=\{\(\) => void exportReport\("XLSX"\)\}/);
  assert.match(report, /DropdownMenuItem onSelect=\{\(\) => void exportReport\("CSV"\)\}/);
  assert.match(report, /URL\.createObjectURL\(file\.blob\)/);
  assert.doesNotMatch(read("features/reporting/accounting-costs/accounting-costs-tabs.tsx"), /Exportar/);
});
