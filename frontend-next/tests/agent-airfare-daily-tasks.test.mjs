import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const api = readSource("../src/lib/cost-engine-api.ts");
const dashboard = readSource("../src/app/agent-dashboard/page.tsx");
const selector = readSource("../src/components/action-menu-modal.tsx");
const tasks = readSource("../src/features/cost-engine/airfare-daily-task-dialog.tsx");

test("only shows the AIRFARE priority card when the bounded status reports pending work", () => {
  assert.match(selector, /airfareStatus && airfareStatus\.pendingToday > 0 && onSelectAirfare/);
  assert.match(selector, /Actualización de tarifas aéreas/);
  assert.match(selector, /Revisar tarifas/);
  assert.match(selector, /onSelectTrips/);
  assert.match(dashboard, /getAgentAirfareDailyStatus\(\)/);
  assert.match(dashboard, /isAgent \? \(\) => setShowAirfareTasks\(true\) : undefined/);
});

test("uses the compact backend task model for both travel source types without per-row component requests", () => {
  assert.match(api, /\/travel-costing\/airfare\/daily-tasks/);
  assert.match(api, /pageSize: 20/);
  assert.match(tasks, /task\.sourceTravelType === "TRAVEL_PACKAGE" \? "Paquete turístico" : "Viaje interno"/);
  assert.match(tasks, /origin.*destination/);
  assert.match(tasks, /task\.currentSnapshot\.amount/);
  assert.doesNotMatch(tasks, /getCostComponent\(/);
  assert.doesNotMatch(tasks, /getComponentHistory\(/);
  assert.doesNotMatch(tasks, /listCostEvidence\(/);
  assert.match(tasks, /key=\{task\.costComponentId\}/);
  assert.match(tasks, /registerAgentAirfareDailyAuthority\(task\.costComponentId/);
});

test("registers exact monetary strings with only the component identifier and refreshes status and tasks", () => {
  assert.match(tasks, /const MONEY_PATTERN = \/\^\\d\+\(\?:\\\.\\d\{1,5\}\)\?\$\//);
  assert.match(tasks, /observedAmount: amount/);
  assert.match(tasks, /registerAgentAirfareDailyAuthority\(task\.costComponentId/);
  assert.match(tasks, /await Promise\.all\(\[refreshTasks\(\), onChanged\(\)\]\)/);
  assert.match(api, /\/travel-costing\/airfare\/components\/\$\{encodeURIComponent\(costComponentId\)\}\/daily-authority/);
  assert.doesNotMatch(api, /registerAgentAirfareDailyAuthority[\s\S]{0,500}tenantId\s*:/);
  assert.doesNotMatch(api, /registerAgentAirfareDailyAuthority[\s\S]{0,500}costingProjectId\s*:/);
  assert.doesNotMatch(tasks, /parseFloat\(observedAmount/);
  assert.doesNotMatch(tasks, /Number\(observedAmount/);
});

test("surfaces first-write conflicts safely and supports continuing to the next pending task", () => {
  assert.match(tasks, /AIRFARE_DAILY_AUTHORITY_ALREADY_REGISTERED/);
  assert.match(tasks, /Esta tarifa ya fue registrada hoy\./);
  assert.match(tasks, /Registrar y continuar/);
  assert.match(tasks, /setSelectedTask\(nextTasks\[0\]\)/);
});

test("keeps the AGENT screen limited to daily AIRFARE registration without override or admin workspace controls", () => {
  assert.doesNotMatch(tasks, /override/i);
  assert.doesNotMatch(tasks, /Cost Workspace/);
  assert.doesNotMatch(tasks, /Supplier|Categor/);
  assert.doesNotMatch(tasks, /uploadCostEvidence|evidence/i);
});
