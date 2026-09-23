import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const catalogApi = read("../src/lib/fiscal-catalog-api.ts");
const selection = read("../src/features/fiscal-catalog/fiscal-catalog-selection.tsx");
const customSettings = read("../src/app/admin/custom-quotation-settings/page.tsx");
const additionalProfile = read("../src/app/admin/pricing-configurations/additional-service-fiscal-profile-modal.tsx");
const additionalApi = read("../src/lib/additional-services-admin-api.ts");

test("el cliente fiscal compartido usa exclusivamente los endpoints de catálogo", () => {
  assert.match(catalogApi, /\/fiscal-catalogs\/cabys\/search/);
  assert.match(catalogApi, /\/fiscal-catalogs\/cabys\/confirm/);
  assert.match(catalogApi, /\/fiscal-catalogs\/units/);
  assert.match(catalogApi, /\/fiscal-catalogs\/taxes/);
  assert.match(catalogApi, /\/fiscal-catalogs\/taxes\/\$\{encodeURIComponent\(taxCode\)\}\/rates/);
  assert.doesNotMatch(additionalApi, /export function searchFiscalCatalogCabys/);
});

test("la selección fiscal compartida exige catálogo y deriva la tarifa", () => {
  assert.match(selection, /searchFiscalCatalogCabys\(query\)/);
  assert.match(selection, /getFiscalCatalogUnits\(\)/);
  assert.match(selection, /getFiscalCatalogTaxes\(\)/);
  assert.match(selection, /getFiscalCatalogTaxRates\(value\.taxCode\)/);
  assert.match(selection, /taxCode, taxRateCode: ""/);
  assert.match(selection, /Porcentaje fiscal de la tarifa seleccionada/);
  assert.match(selection, /readOnly/);
  assert.doesNotMatch(selection, /referenceTaxPercentage[^\n]*value=/);
});

test("la clasificación fiscal de cotizaciones no permite códigos libres ni envía porcentaje", () => {
  assert.match(customSettings, /FiscalCatalogSelection/);
  assert.match(customSettings, /confirmFiscalCatalogCabys\(input\.cabysCode\)/);
  assert.doesNotMatch(customSettings, /id="fiscal-cabys"/);
  assert.doesNotMatch(customSettings, /id="fiscal-uom"/);
  assert.doesNotMatch(customSettings, /id="fiscal-tax-code"/);
  assert.doesNotMatch(customSettings, /id="fiscal-tax-rate"/);
  assert.doesNotMatch(customSettings, /taxPercentage:\s*(?!classification\.)/);
  assert.match(customSettings, /disabled=\{saving \|\| !catalogState\.complete\}/);
});

test("Additional Services conserva su wrapper, confirmación y ciclo de vida", () => {
  assert.match(additionalProfile, /FiscalCatalogSelection/);
  assert.match(additionalProfile, /confirmFiscalCatalogCabys\(form\.cabysCode\)/);
  assert.match(additionalProfile, /createAdditionalServiceFiscalProfile/);
  assert.match(additionalProfile, /updateAdditionalServiceFiscalProfile/);
  assert.match(additionalProfile, /updateAdditionalServiceFiscalProfileStatus/);
  assert.doesNotMatch(additionalProfile, /TenantFiscalClassification/);
});
