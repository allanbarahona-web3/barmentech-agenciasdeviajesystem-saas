import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const priceDisplay = read("../src/lib/travel-commercial-price.ts");
const modal = read("../src/components/create-trip-modal.tsx");
const form = read("../src/components/create-trip-form.tsx");
const packages = read("../src/components/travel-packages-manager.tsx");
const internalList = read("../src/app/admin/internal-trips/components/internal-trips-list.tsx");
const internalEdit = read("../src/app/admin/internal-trips/[id]/edit/page.tsx");
const commercialPackages = read("../src/app/trips/page.tsx");
const commercialInternalTrips = read("../src/app/internal-trips-available/page.tsx");
const travelPackagesApi = read("../src/lib/travel-packages-api.ts");
const internalTripsApi = read("../src/lib/internal-trips-api.ts");
const pricingWorkspace = read("../src/features/pricing/pricing-workspace.tsx");

test("new travel forms keep currency but do not require or send a manual commercial price", () => {
  assert.doesNotMatch(modal, /const \[price, setPrice\]/);
  assert.doesNotMatch(form, /const \[price, setPrice\]/);
  assert.doesNotMatch(modal, /price:\s*parseFloat\(price\)|packagePrice:\s*parseFloat\(price\)/);
  assert.doesNotMatch(form, /price:\s*parseFloat\(price\)/);
  assert.match(modal, /currency,/);
  assert.match(form, /currency,/);
  assert.match(modal, /Precio pendiente/);
  assert.match(form, /Precio pendiente/);
});

test("travel cards distinguish pending, legacy, and Pricing-published commercial prices", () => {
  assert.match(priceDisplay, /"PENDING" \| "LEGACY" \| "PRICING_PUBLISHED"/);
  assert.match(priceDisplay, /return "Precio pendiente"/);
  assert.match(packages, /formatTravelCommercialPrice\(pkg\.packagePrice, pkg\.priceCurrency, pkg\.commercialPriceStatus\)/);
  assert.match(internalList, /formatTravelCommercialPrice\(trip\.price, trip\.currency, trip\.commercialPriceStatus\)/);
  assert.match(pricingWorkspace, /Precio manual heredado; aún no ha sido publicado por Pricing/);
});

test("ordinary edit forms do not send a manual price for Pricing-published travel", () => {
  assert.match(packages, /editingPackage\?\.commercialPriceStatus === "LEGACY" && \{ packagePrice: priceNum \}/);
  assert.match(packages, /editingPackage\?\.commercialPriceStatus !== "PRICING_PUBLISHED" && \{ priceCurrency \}/);
  assert.match(internalList, /editingTrip\.commercialPriceStatus === 'LEGACY' && \{ price: parseFloat\(formData\.price\) \}/);
  assert.match(internalList, /controlado por Pricing/);
});

test("locks the travel currency after CostingProject composition starts", () => {
  const helper = "La moneda no puede cambiarse después de iniciar la composición de costos.";

  assert.match(travelPackagesApi, /hasCostingProject\?: boolean/);
  assert.match(internalTripsApi, /hasCostingProject\?: boolean/);
  assert.match(packages, /disabled=\{Boolean\(editingPackage\?\.hasCostingProject\)\}/);
  assert.match(packages, new RegExp(helper));
  assert.match(internalList, /disabled=\{editingTrip\.hasCostingProject\}/);
  assert.match(internalList, new RegExp(helper));
  assert.match(internalEdit, /disabled=\{Boolean\(trip\?\.hasCostingProject\)\}/);
  assert.match(internalEdit, new RegExp(helper));
});

test("commercial selectors use server-filtered availability reads", () => {
  assert.match(commercialPackages, /getAvailableTravelPackages\(travelType \|\| undefined\)/);
  assert.match(commercialInternalTrips, /\/internal-trips\/available/);
  assert.match(commercialInternalTrips, /trip\.status === 'OPEN'/);
  assert.doesNotMatch(commercialInternalTrips, /trip\.price\s*[!=>]/);
  assert.doesNotMatch(commercialInternalTrips, /parseFloat\(trip\.price/);
});

test("Pricing remains explicit and no Additional Services pricing is introduced", () => {
  assert.match(pricingWorkspace, /Publicar precio/);
  for (const source of [priceDisplay, modal, form, packages, internalList]) {
    assert.doesNotMatch(source, /additional-services|Additional Services|AdditionalServices/i);
  }
});
