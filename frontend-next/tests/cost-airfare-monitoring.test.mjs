import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const api = readSource("../src/lib/cost-engine-api.ts");
const workspace = readSource("../src/features/cost-engine/cost-workspace.tsx");
const evolution = readSource("../src/features/cost-engine/airfare-evolution-dialog.tsx");

test("adds the ADMIN-only Cost Workspace entry point for AIRFARE evolution", () => {
  assert.match(workspace, /role !== "ADMIN"/);
  assert.match(workspace, /Evolución de costos/);
  assert.match(workspace, /setShowEvolution\(true\)/);
  assert.match(workspace, /<AirfareEvolutionDialog/);
});

test("uses bounded project/component AIRFARE history endpoints and renders revision kinds distinctly", () => {
  assert.match(api, /\/travel-costing\/airfare\/projects\/\$\{encodeURIComponent\(costingProjectId\)\}\/history/);
  assert.match(api, /\/travel-costing\/airfare\/components\/\$\{encodeURIComponent\(costComponentId\)\}\/history/);
  assert.match(evolution, /listAdminProjectAirfareHistory\(project\.id, page, 20\)/);
  assert.match(evolution, /listAdminComponentAirfareHistory\(selectedComponentId, page, 20\)/);
  assert.match(evolution, /row\.kind === "ADMIN_OVERRIDE"/);
  assert.match(evolution, /revisionKindLabel\(row\.kind\)/);
  assert.match(evolution, /Anulación administrativa/);
  assert.match(evolution, /Registro de agente/);
  assert.match(evolution, /row\.observedAmount/);
  assert.match(evolution, /row\.appliedAmount/);
});

test("uses history authority IDs for overrides and refreshes history plus current composition", () => {
  assert.match(evolution, /overrideAdminAirfareDailyAuthority\(row\.airfareDailyAuthorityId/);
  assert.match(evolution, /El motivo de anulación es requerido\./);
  assert.match(evolution, /Promise\.all\(\[loadHistory\(\), onCompositionChanged\(\)\]\)/);
  assert.match(evolution, /historial conserva las revisiones anteriores/);
  assert.doesNotMatch(evolution, /create.*daily-authority/i);
});

test("loads evidence lazily from the applied snapshot and uses signed access without per-row requests", () => {
  assert.match(evolution, /listCostEvidence\(row\.appliedSnapshotId\)/);
  assert.match(evolution, /getCostEvidenceAccess\(row\.appliedSnapshotId, item\.id\)/);
  assert.match(evolution, /Los comprobantes se cargan solo al abrir esta revisión/);
  assert.doesNotMatch(evolution, /history\.map\([^)]*listCostEvidence/);
  assert.doesNotMatch(evolution, /getCostComponent\(/);
});

test("preserves exact monetary strings and does not invent project-total variation or commercial data", () => {
  assert.match(evolution, /const MONEY_PATTERN = \/\^\\d\+\(\?:\\\.\\d\{1,5\}\)\?\$\//);
  assert.match(evolution, /function exactMoney\(amount: string, currency: string\) \{ return `\$\{currency\} \$\{amount\}`; \}/);
  assert.doesNotMatch(evolution, /parseFloat|Number\(.*Amount|percentage|variación|markup|selling price|published price|comisi[oó]n|impuesto/i);
  assert.match(evolution, /authoritativeTotalCost/);
});
