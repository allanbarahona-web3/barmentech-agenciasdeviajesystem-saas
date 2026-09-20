import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const typescript = require("typescript");

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const pricingApi = readSource("../src/lib/pricing-api.ts");
const pricingWorkspace = readSource("../src/features/pricing/pricing-workspace.tsx");
const costWorkspace = readSource("../src/features/cost-engine/cost-workspace.tsx");

function pricingApiWith(fetchApi) {
  const compiled = typescript.transpileModule(pricingApi, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require: (specifier) => {
      if (specifier === "@/lib/api-client") return { apiGet: () => undefined, apiPost: () => undefined, fetchApi };
      throw new Error(`Unexpected module: ${specifier}`);
    },
  });
  return module.exports;
}

const response = ({ ok = true, status = 200, statusText = "OK", body = "" } = {}) => ({
  ok,
  status,
  statusText,
  text: async () => body,
});

test("activates the ADMIN Pricing workspace without changing Costos or Historial navigation", () => {
  assert.match(costWorkspace, /useState<"COSTS" \| "PRICING">\("COSTS"\)/);
  assert.match(costWorkspace, /onClick=\{\(\) => setActiveWorkspace\("COSTS"\)\}>Costos/);
  assert.match(costWorkspace, /onClick=\{\(\) => setActiveWorkspace\("PRICING"\)\}>Pricing/);
  assert.match(costWorkspace, /onClick=\{\(\) => setShowEvolution\(true\)\}>Historial de costos/);
  assert.match(costWorkspace, /activeWorkspace === "PRICING" \? <PricingWorkspace/);
  assert.match(costWorkspace, /role !== "ADMIN"/);
});

test("uses only independent Pricing APIs and keeps configuration values exact strings", () => {
  for (const path of [
    "/pricing/projects/${encodeURIComponent(costingProjectId)}/configuration",
    "/pricing/projects/${encodeURIComponent(costingProjectId)}/calculations",
    "/pricing/calculations/${encodeURIComponent(pricingCalculationVersionId)}/approve",
  ]) assert.ok(pricingApi.includes(path));
  assert.match(pricingWorkspace, /type PricingConfigurationInput/);
  assert.match(pricingWorkspace, /inputMode="decimal"/);
  assert.match(pricingWorkspace, /const nextCalculation = await calculatePricing\(costingProjectId\)/);
  assert.doesNotMatch(pricingWorkspace, /calculatePricingV1|parseFloat|Math\.round|toFixed|Additional Services/i);
  assert.doesNotMatch(pricingApi, /additional-services|Additional Services/i);
});

test("tolerates empty successful nullable calculation reads without changing shared apiGet", async () => {
  const calls = [];
  const api = pricingApiWith(async (path) => {
    calls.push(path);
    return response();
  });

  assert.equal(await api.getLatestPricingCalculation("project-1"), null);
  assert.equal(await api.getLatestApprovedPricingCalculation("project-1"), null);
  assert.deepEqual(calls, [
    "/pricing/projects/project-1/calculations/latest",
    "/pricing/projects/project-1/calculations/approved",
  ]);
  assert.match(pricingApi, /async function getNullablePricingCalculation/);
  assert.doesNotMatch(pricingApi, /async function apiGet/);
});

test("treats 204 as no nullable calculation and still parses normal JSON", async () => {
  const expected = { id: "calculation-1", finalSellingPrice: "125.00000" };
  const api = pricingApiWith(async (path) => path.endsWith("/latest")
    ? response({ status: 204 })
    : response({ body: JSON.stringify(expected) }));

  assert.equal(await api.getLatestPricingCalculation("project-1"), null);
  assert.equal(JSON.stringify(await api.getLatestApprovedPricingCalculation("project-1")), JSON.stringify(expected));
});

test("preserves the existing non-OK error behavior for nullable calculation reads", async () => {
  const api = pricingApiWith(async () => response({ ok: false, status: 503, statusText: "Service Unavailable" }));

  await assert.rejects(
    () => api.getLatestPricingCalculation("project-1"),
    { message: "API Error: Service Unavailable" },
  );
});

test("renders the approved configuration fields and calculation-basis helper text", () => {
  for (const label of [
    "Costo autoritativo",
    "Gastos operativos",
    "Margen de riesgo (%)",
    "Margen de utilidad objetivo (%)",
    "Comisión vendedor (%)",
    "Comisión bancaria (%)",
    "Impuesto aplicable (%)",
  ]) assert.match(pricingWorkspace, new RegExp(label.replace(/[()]/g, "\\$&")));
  for (const helper of [
    "Calculado sobre costo base.",
    "Margen real sobre precio antes de impuesto.",
    "Calculada sobre precio antes de impuesto.",
    "Calculada sobre el precio final cobrado, incluyendo impuesto.",
  ]) assert.match(pricingWorkspace, new RegExp(helper.replace(/[().]/g, "\\$&")));
  assert.match(pricingWorkspace, /<Input readOnly value=\{money\(context\.currentAuthoritativeCost, currency\)\}/);
  assert.match(pricingWorkspace, /Guardar configuración/);
});

test("renders only backend-authoritative financial breakdown values and approval state", () => {
  for (const label of [
    "Costo económico ajustado",
    "Reserva de riesgo",
    "Comisión vendedor",
    "Comisión bancaria",
    "PRECIO FINAL RECOMENDADO",
    "Utilidad estimada de la agencia",
    "Antes de impuesto sobre la renta",
  ]) assert.match(pricingWorkspace, new RegExp(label));
  assert.match(pricingWorkspace, /money\(calculation\.salesCommissionAmount, currency\)/);
  assert.match(pricingWorkspace, /money\(calculation\.bankCommissionAmount, currency\)/);
  assert.match(pricingWorkspace, /money\(calculation\.estimatedAgencyProfitBeforeIncomeTax, currency\)/);
  assert.match(pricingWorkspace, /calculation\.status === "DRAFT" && !calculation\.stale/);
  assert.match(pricingWorkspace, /Aprobar precio/);
  assert.match(pricingWorkspace, /Los costos del proyecto cambiaron desde este cálculo\. Recalcula antes de aprobar\./);
  assert.match(pricingWorkspace, /disabled=\{!canApprove \|\| approving\}/);
});

test("keeps the financial breakdown compact by default while preserving expandable backend values", () => {
  assert.match(pricingWorkspace, /<CollapsibleBreakdown label="Costo económico ajustado" value=\{money\(calculation\.adjustedEconomicCostAmount, currency\)\}>/);
  assert.match(pricingWorkspace, /<CollapsibleBreakdown label="Precio antes de impuesto" value=\{money\(calculation\.preTaxSellingPrice, currency\)\}>/);
  assert.match(pricingWorkspace, /<CollapsibleBreakdown label="Conciliación" value="Ver detalle">/);
  assert.match(pricingWorkspace, /function CollapsibleBreakdown[\s\S]*<details className="group rounded-lg border border-border bg-muted\/20">/);
  assert.match(pricingWorkspace, /<div className="border-t border-border p-3">\{children\}<\/div>/);
  assert.doesNotMatch(pricingWorkspace, /function BreakdownSection/);
  assert.doesNotMatch(pricingWorkspace, /<BreakdownRow label="Impuesto aplicable"[^>]*\/>\s*<BreakdownRow label="Precio antes de impuesto"/);
});

test("uses Spanish pricing copy and shows a spinner during pending pricing actions", () => {
  for (const label of [
    "Configuración de precio",
    "Calculado con la política de precios vigente.",
    "Aprobar precio",
    "Historial de precios",
  ]) assert.match(pricingWorkspace, new RegExp(label.replace(/[().]/g, "\\$&")));
  assert.doesNotMatch(pricingWorkspace, /Configuración de Pricing|Calculado por Pricing Engine|Aprobar pricing|PRICING_V1/);
  assert.match(pricingWorkspace, /function ButtonLoadingLabel[\s\S]*LoaderCircle className="animate-spin"/);
  for (const label of ["Guardando…", "Calculando…", "Aprobando…", "Publicando…"]) assert.match(pricingWorkspace, new RegExp(`<ButtonLoadingLabel label="${label}"`));
});

test("uses bounded pricing history and tenant timezone formatting", () => {
  assert.match(pricingApi, /pageSize = 20/);
  assert.match(pricingWorkspace, /listPricingCalculationVersions\(costingProjectId, page, 20\)/);
  assert.match(pricingWorkspace, /useTenantDateTimeFormatter/);
  assert.match(pricingWorkspace, /const formatTenantDateTime = useTenantDateTimeFormatter\(\)/);
  assert.match(pricingWorkspace, /formatTenantDateTime\(version\.createdAt\)/);
  assert.match(pricingWorkspace, /formatTenantDateTime\(calculation\.approvedAt\)/);
  assert.doesNotMatch(pricingWorkspace, /toLocaleString|new Date\(/);
});

test("keeps Pricing internals confined to the ADMIN-only Cost Workspace", () => {
  assert.match(costWorkspace, /if \(role !== "ADMIN"\)/);
  assert.doesNotMatch(pricingWorkspace, /AGENT|custom quotation|SalesOrder|TravelPackage\.packagePrice|InternalTrip\.price/i);
  assert.doesNotMatch(pricingApi, /commercial-output/);
});

test("publishes only an approved non-stale result through the explicit travel-pricing adapter", () => {
  assert.match(pricingApi, /\/travel-pricing\/projects\/\$\{encodeURIComponent\(costingProjectId\)\}\/publication/);
  assert.match(pricingApi, /\/travel-pricing\/calculations\/\$\{encodeURIComponent\(pricingCalculationVersionId\)\}\/publish/);
  assert.match(pricingWorkspace, /const \[publicationContext, setPublicationContext\]/);
  assert.match(pricingWorkspace, /const publish = async \(\) => \{[\s\S]*publishPricingCalculation\(calculation\.id\)/);
  assert.match(pricingWorkspace, /calculation\.status !== "APPROVED" \|\| calculation\.stale/);
  assert.match(pricingWorkspace, /Publicar precio/);
  assert.match(pricingWorkspace, /<PublicationConfirmationDialog/);
  assert.doesNotMatch(pricingWorkspace, /packagePrice:|InternalTrip\.price|finalSellingPrice:.*input/i);
});

test("shows current travel price and floor, while blocking a below-floor publication", () => {
  for (const label of ["Precio aprobado", "Precio actual del viaje", "Piso comercial"]) assert.match(pricingWorkspace, new RegExp(label));
  assert.match(pricingWorkspace, /exactAmountIsBelow\(calculation\.finalSellingPrice, publicationContext\.commercialFloorPrice\)/);
  assert.match(pricingWorkspace, /El precio aprobado está por debajo del piso comercial de/);
  assert.match(pricingWorkspace, /disabled=\{belowCommercialFloor\}/);
  assert.match(pricingWorkspace, /disabled=\{publishing \|\| !calculation \|\| !publicationContext \|\| calculation\.stale \|\| belowCommercialFloor\}/);
});

test("refreshes persisted publication context and formats publication timestamps in tenant time", () => {
  assert.match(pricingWorkspace, /const refreshedPublicationContext = await getTravelPricingPublicationContext\(costingProjectId\)/);
  assert.match(pricingWorkspace, /setPublicationContext\(refreshedPublicationContext\)/);
  assert.match(pricingWorkspace, /formatTenantDateTime\(context\.latestPublication\.publishedAt\)/);
  assert.doesNotMatch(pricingWorkspace, /toLocaleString|new Date\(/);
});
