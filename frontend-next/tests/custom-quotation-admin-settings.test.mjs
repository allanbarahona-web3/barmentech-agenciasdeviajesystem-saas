import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const navigation = readFileSync(
  new URL("../src/components/vertical-nav.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../src/app/admin/custom-quotation-settings/page.tsx", import.meta.url),
  "utf8",
);
const api = readFileSync(
  new URL("../src/lib/custom-quotation-admin-settings-api.ts", import.meta.url),
  "utf8",
);

test("la configuración de cotizaciones personalizadas está disponible solo para ADMIN", () => {
  assert.match(navigation, /href: "\/admin\/custom-quotation-settings"/);
  assert.match(navigation, /label: "Cotizaciones personalizadas"/);
  assert.match(
    navigation,
    /\{\s*href: "\/admin\/custom-quotation-settings",[\s\S]{0,180}adminOnly: true,[\s\S]{0,220}\]\s*:\s*\[\]\),/,
  );
  assert.match(page, /if \(role !== "ADMIN"\)/);
});

test("las políticas usan los contratos ADMIN y preservan valores decimales como texto", () => {
  assert.match(api, /"\/admin\/pricing-policies\?page=1&pageSize=25"/);
  assert.match(api, /createTenantPricingPolicy[\s\S]*method: "POST"/);
  assert.match(api, /updateTenantPricingPolicy[\s\S]*method: "PATCH"/);
  assert.match(api, /\/status/);
  assert.match(api, /\/default/);
  assert.match(page, /Predeterminada para cotizaciones personalizadas/);
  assert.match(api, /operationalCostsAmountDefault: string/);
  assert.doesNotMatch(`${api}\n${page}`, /parseFloat|parseInt|Math\.|toFixed\(/);
  assert.match(page, /await load\(\);/);
});

test("las clasificaciones fiscales usan el catálogo backend sin autoría de porcentaje", () => {
  assert.match(api, /"\/admin\/fiscal-classifications\?page=1&pageSize=25"/);
  assert.match(api, /\/default-for-custom-quotations/);
  assert.match(page, /Porcentaje de impuesto/);
  assert.match(page, /classification\.taxPercentage/);
  assert.match(page, /El porcentaje de impuesto se obtiene del catálogo fiscal en el backend/);
  assert.doesNotMatch(page, /id="fiscal-tax-percentage"/);
  assert.doesNotMatch(api, /taxPercentage.*JSON\.stringify/);
});

test("la página cubre vacíos y no toca el flujo comercial de agentes", () => {
  assert.match(page, /No hay una política de precios configurada\./);
  assert.match(page, /No hay una clasificación fiscal configurada\./);
  assert.match(page, /No hay una configuración predeterminada para cotizaciones personalizadas\./);
  assert.doesNotMatch(page, /custom-quotations-api|PricingWorkspace|calculateCustomQuotationPricing|fiscalClassificationId/);
});
