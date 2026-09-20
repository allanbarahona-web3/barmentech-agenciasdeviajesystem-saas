import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const api = readSource("../src/lib/cost-engine-api.ts");
const workspace = readSource("../src/features/cost-engine/cost-workspace.tsx");
const evolution = readSource("../src/features/cost-engine/airfare-evolution-dialog.tsx");
const categoryLabels = readSource("../src/features/cost-engine/cost-category-label.ts");
const globalStyles = readSource("../src/app/globals.css");

test("adds the ADMIN-only Cost Workspace entry point for Cost History", () => {
  assert.match(workspace, /role !== "ADMIN"/);
  assert.match(workspace, />Historial de costos<\/Button>/);
  assert.match(workspace, /setShowEvolution\(true\)/);
  assert.match(workspace, /<AirfareEvolutionDialog/);
});

test("uses bounded unified component/project monetary timeline endpoints and renders stable event types", () => {
  assert.match(api, /\/cost-engine\/projects\/\$\{encodeURIComponent\(costingProjectId\)\}\/monetary-timeline/);
  assert.match(evolution, /listProjectMonetaryTimeline\(project\.id, page, 20, selectedCategoryCode \|\| undefined\)/);
  assert.match(evolution, /INITIAL_COST: "Costo inicial"/);
  assert.match(evolution, /COST_SNAPSHOT: "Actualización de costo"/);
  assert.match(evolution, /AGENT_INITIAL: "Actualización diaria"/);
  assert.match(evolution, /ADMIN_OVERRIDE: "Ajuste de administrador"/);
  assert.match(evolution, /row\.observedAmount/);
  assert.match(evolution, /row\.appliedAmount/);
});

test("renders Cost History instants in the tenant timezone and keeps business dates date-only", () => {
  assert.match(evolution, /useTenantDateTimeFormatter/);
  assert.match(evolution, /const formatTenantDateTime = useTenantDateTimeFormatter\(\)/);
  assert.match(evolution, /formatTenantDateTime\(row\.effectiveAt\)/);
  assert.match(evolution, /formatBusinessDate\(row\.businessDate\)/);
  assert.doesNotMatch(evolution, /function timestamp\(/);
  assert.doesNotMatch(evolution, /replace\("T", " "\)\.slice\(0, 16\)/);
});

test("uses only timeline authority IDs for overrides and refreshes history plus current composition", () => {
  assert.match(evolution, /overrideAdminAirfareDailyAuthority\(row\.airfareDailyAuthorityId/);
  assert.match(evolution, /row\.airfareDailyAuthorityId \? <Button/);
  assert.match(evolution, /Motivo del ajuste \*/);
  assert.match(evolution, /Ajustar tarifa diaria/);
  assert.doesNotMatch(evolution, /Anular costo de boleto aéreo/);
  assert.match(evolution, /Promise\.all\(\[loadTimeline\(\), onCompositionChanged\(\)\]\)/);
  assert.match(evolution, /historial conserva las revisiones anteriores/);
  assert.doesNotMatch(evolution, /create.*daily-authority/i);
});

test("opens one evidence directly in AttachmentViewer with lazy snapshot-scoped access", () => {
  assert.match(evolution, /row\.hasEvidence \? <Button/);
  assert.match(evolution, /onEvidence=\{\(trigger\) => void openEvidence\(row, trigger\)\}/);
  assert.match(evolution, /const response = await listCostEvidence\(row\.snapshotId\)/);
  assert.match(evolution, /setEvidenceViewer\(\{ snapshotId: row\.snapshotId, attachments \}\)/);
  assert.match(evolution, /<AttachmentViewer attachments=\{evidenceViewer\.attachments\} initialIndex=\{0\}/);
  assert.match(evolution, /getCostEvidenceAccess\(evidenceViewer\.snapshotId, attachment\.id\)/);
  assert.doesNotMatch(evolution, /window\.open/);
  assert.doesNotMatch(evolution, /function EvidenceDialog/);
  assert.doesNotMatch(evolution, /Comprobantes del costo/);
  assert.doesNotMatch(evolution, /getCostComponent\(/);
});

test("closing AttachmentViewer preserves the mounted Cost History context and returns focus to its evidence action", () => {
  assert.match(evolution, /const evidenceTriggerRef = useRef<HTMLButtonElement \| null>\(null\)/);
  assert.match(evolution, /evidenceTriggerRef\.current = trigger/);
  assert.match(evolution, /const closeEvidenceViewer = useCallback\(\(\) => \{[\s\S]*setEvidenceViewer\(null\);[\s\S]*requestAnimationFrame\(\(\) => evidenceTriggerRef\.current\?\.focus\(\)\)/);
  assert.match(evolution, /onClose=\{closeEvidenceViewer\}/);
  assert.match(evolution, /onEscapeKeyDown=\{\(event\) => \{ if \(evidenceViewer\) event\.preventDefault\(\); \}\}/);
  assert.match(evolution, /onPointerDownOutside=\{\(event\) => \{ if \(evidenceViewer\) event\.preventDefault\(\); \}\}/);
  assert.match(globalStyles, /\.attachment-viewer-overlay \{[\s\S]*pointer-events: auto/);
  assert.doesNotMatch(evolution, /router\.(?:back|push|replace)|history\.back/);
});

test("viewer close does not reset the selected component, page, or loaded timeline", () => {
  const closeViewer = evolution.match(/const closeEvidenceViewer = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/);
  assert.ok(closeViewer);
  assert.doesNotMatch(closeViewer[1], /setSelectedComponentId|setPage|setTimelinePage|loadTimeline/);
});

test("passes all bounded evidence files directly to AttachmentViewer without an intermediate filename modal", () => {
  assert.match(evolution, /response\.evidence\.map\(\(evidence\) => \(\{ id: evidence\.id, originalFileName: evidence\.originalFileName, mimeType: evidence\.mimeType \}\)\)/);
  assert.match(evolution, /attachments=\{evidenceViewer\.attachments\}/);
  assert.doesNotMatch(evolution, /evidence\.map\(\(item\) => <Button/);
  assert.doesNotMatch(evolution, /Cargando comprobantes/);
});

test("preserves exact monetary strings and does not invent project-total variation or commercial data", () => {
  assert.match(evolution, /const MONEY_PATTERN = \/\^\\d\+\(\?:\\\.\\d\{1,5\}\)\?\$\//);
  assert.match(evolution, /function exactMoney\(amount: string, currency: string\) \{ return `\$\{currency\} \$\{amount\}`; \}/);
  assert.doesNotMatch(evolution, /parseFloat|Number\(.*Amount|percentage|variación|markup|selling price|published price|comisi[oó]n|impuesto/i);
  assert.match(evolution, /authoritativeTotalCost/);
});

test("keeps source navigation external and shows the unified empty state", () => {
  assert.match(evolution, /href=\{row\.sourceUrl\} target="_blank" rel="noreferrer">Abrir fuente/);
  assert.match(evolution, /No hay historial de costos todavía/);
});

test("filters Cost History by Spanish category while retaining archived history", () => {
  assert.match(evolution, /const \[selectedCategoryCode, setSelectedCategoryCode\] = useState\(""\)/);
  assert.match(evolution, /Todas las categorías/);
  assert.match(evolution, /listProjectMonetaryTimeline\(project\.id, page, 20, selectedCategoryCode \|\| undefined\)/);
  assert.match(evolution, /costCategoryDisplayName\(row\.category\)/);
  assert.match(categoryLabels, /AIRFARE: "Boleto aéreo"/);
  assert.match(categoryLabels, /EVENT_TICKET: "Entradas"/);
  assert.doesNotMatch(evolution, /row\.category\.displayName/);
});

test("shows structural lifecycle events and allows only archived components to reactivate", () => {
  assert.match(api, /COMPONENT_DEACTIVATED/);
  assert.match(api, /COMPONENT_REACTIVATED/);
  assert.match(api, /reactivateCostComponent/);
  assert.match(evolution, /COMPONENT_DEACTIVATED: "Componente desactivado"/);
  assert.match(evolution, /COMPONENT_REACTIVATED: "Componente reactivado"/);
  assert.match(evolution, /const archived = row\.componentStatus === "ARCHIVED"/);
  assert.match(evolution, /No incluido en el costo actual/);
  assert.match(evolution, /<Badge variant="destructive" className="px-3 py-1 text-sm font-semibold shadow-sm">Desactivado<\/Badge>/);
  assert.match(evolution, /<Badge variant="default" className="bg-success px-3 py-1 text-sm font-semibold text-white shadow-sm">Activo<\/Badge>/);
  assert.match(evolution, /archived \? <Button[^>]*>Reactivar componente/);
  assert.match(evolution, /<Dialog open=\{Boolean\(reactivationRow\)\}/);
  assert.match(evolution, /reactivateCostComponent\(reactivationRow\.costComponentId\)/);
  assert.match(evolution, /No se creará un nuevo registro monetario/);
  assert.match(evolution, /formatTenantDateTime\(row\.effectiveAt\)/);
  assert.doesNotMatch(evolution, /Volver a composición/);
});
