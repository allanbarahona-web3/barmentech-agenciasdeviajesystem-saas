import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  catalogUsageLabels,
  createCatalogInput,
  hasAdditionalServiceUsage,
  TRAVEL_FISCAL_CLASSIFICATION_USAGES,
  validateTravelClassificationForm,
} from '../src/lib/additional-service-catalog-admin.ts';

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const item = (usages) => ({
  id: 'catalog-1',
  code: 'TOUR',
  name: 'Tour',
  isActive: true,
  usages,
  pricingConfiguration: null,
  fiscalProfile: null,
  fiscalReadiness: { status: 'ABSENT', isReady: false, issues: [] },
});

test('presents every usage with its human-friendly label, including multiple usages', () => {
  assert.deepEqual(catalogUsageLabels, {
    ADDITIONAL_SERVICE: 'Servicio adicional',
    TRAVEL_PACKAGE: 'Viaje internacional / migración',
    INTERNAL_TRIP: 'Viaje interno',
  });
  assert.deepEqual(
    item(['TRAVEL_PACKAGE', 'INTERNAL_TRIP']).usages.map(
      (usage) => catalogUsageLabels[usage],
    ),
    ['Viaje internacional / migración', 'Viaje interno'],
  );
});

for (const usages of [
  ['TRAVEL_PACKAGE'],
  ['INTERNAL_TRIP'],
  ['TRAVEL_PACKAGE', 'INTERNAL_TRIP'],
]) {
  test(`creates a travel fiscal classification with usages ${usages.join(', ')}`, () => {
    assert.deepEqual(
      createCatalogInput({
        code: ' travel ',
        name: ' Clasificación ',
        fiscalItemCategory: 'SERVICE',
        usages,
      }),
      {
        code: 'travel',
        name: 'Clasificación',
        fiscalItemCategory: 'SERVICE',
        usages,
      },
    );
  });
}

test('offers only travel usages and rejects blank fields, zero usages, or Add-on usage', () => {
  assert.deepEqual(TRAVEL_FISCAL_CLASSIFICATION_USAGES, [
    'TRAVEL_PACKAGE',
    'INTERNAL_TRIP',
  ]);
  assert.equal(
    validateTravelClassificationForm({
      code: '',
      name: 'Item',
      fiscalItemCategory: 'SERVICE',
      usages: ['TRAVEL_PACKAGE'],
    }),
    'El código es requerido.',
  );
  assert.equal(
    validateTravelClassificationForm({
      code: 'ITEM',
      name: ' ',
      fiscalItemCategory: 'SERVICE',
      usages: ['INTERNAL_TRIP'],
    }),
    'El nombre es requerido.',
  );
  assert.equal(
    validateTravelClassificationForm({
      code: 'ITEM',
      name: 'Item',
      fiscalItemCategory: 'SERVICE',
      usages: [],
    }),
    'Seleccione al menos un uso de viaje válido.',
  );
  assert.equal(
    validateTravelClassificationForm({
      code: 'ITEM',
      name: 'Item',
      fiscalItemCategory: 'SERVICE',
      usages: ['ADDITIONAL_SERVICE'],
    }),
    'Seleccione al menos un uso de viaje válido.',
  );
});

test('travel-only items do not support Add-on pricing while Additional Services do', () => {
  assert.equal(hasAdditionalServiceUsage(item(['TRAVEL_PACKAGE'])), false);
  assert.equal(hasAdditionalServiceUsage(item(['INTERNAL_TRIP'])), false);
  assert.equal(
    hasAdditionalServiceUsage(item(['ADDITIONAL_SERVICE', 'TRAVEL_PACKAGE'])),
    true,
  );
});

test('restores existing Add-on actions and adds no row-level catalog editor', () => {
  const page = readSource('../src/app/admin/pricing-configurations/page.tsx');
  const table = readSource('../src/features/pricing-configurations/pricing-configurations-table.tsx');
  assert.doesNotMatch(page, /Editar catálogo/);
  assert.match(page, /onConfigurePricing=\{openConfigurationModal\}/);
  assert.match(table, /Editar fiscal/);
  assert.match(table, /Configurar fiscal/);
  assert.match(table, /supportsPricing \? \(/);
});

test('adds one page-level creation action and no generic usage editor', () => {
  const page = readSource('../src/app/admin/pricing-configurations/page.tsx');
  const modal = readSource(
    '../src/app/admin/pricing-configurations/additional-service-catalog-modal.tsx',
  );
  assert.equal(
    page.match(/Agregar clasificación fiscal/g)?.length,
    1,
  );
  assert.doesNotMatch(modal, /ADDITIONAL_SERVICE/);
  assert.doesNotMatch(page, /updateAdditionalServiceCatalog/);
});

test('travel-only rows show no pricing and retain the shared fiscal action', () => {
  const page = readSource('../src/app/admin/pricing-configurations/page.tsx');
  const table = readSource('../src/features/pricing-configurations/pricing-configurations-table.tsx');
  const profileModal = readSource(
    '../src/app/admin/pricing-configurations/additional-service-fiscal-profile-modal.tsx',
  );
  assert.match(table, /No aplica/);
  assert.match(page, /onConfigureFiscal=\{setSelectedFiscalItem\}/);
  assert.match(page, /AdditionalServiceFiscalProfileModal/);
  assert.match(profileModal, /updateAdditionalServiceFiscalProfile/);
  assert.match(profileModal, /createAdditionalServiceFiscalProfile/);
  assert.match(profileModal, /Clasificación fiscal/);
});

test('travel-only Configure fiscal passes the selected catalog item to the existing modal', () => {
  const page = readSource('../src/app/admin/pricing-configurations/page.tsx');
  const profileModal = readSource(
    '../src/app/admin/pricing-configurations/additional-service-fiscal-profile-modal.tsx',
  );
  assert.match(page, /onConfigureFiscal=\{setSelectedFiscalItem\}/);
  assert.match(page, /item=\{selectedFiscalItem\}/);
  assert.match(profileModal, /open=\{item !== null\}/);
  assert.match(profileModal, /\{item\.name\}/);
  assert.match(
    profileModal,
    /additionalServiceCatalogId: item\.id/,
  );
});

test('the existing fiscal modal initializes create mode and preloads edit mode', () => {
  const profileModal = readSource(
    '../src/app/admin/pricing-configurations/additional-service-fiscal-profile-modal.tsx',
  );
  assert.match(profileModal, /const profile = item\.fiscalProfile/);
  assert.match(profileModal, /return profile \? \{/);
  assert.match(profileModal, /\} : emptyForm/);
  assert.match(profileModal, /profile \? "Editar perfil fiscal" : "Configurar perfil fiscal"/);
  assert.match(profileModal, /if \(profile\) await updateAdditionalServiceFiscalProfile/);
  assert.match(profileModal, /else await createAdditionalServiceFiscalProfile/);
});

test('the shared CABYS, UOM, tax, rate, percentage, and status workflow remains intact', () => {
  const profileModal = readSource(
    '../src/app/admin/pricing-configurations/additional-service-fiscal-profile-modal.tsx',
  );
  const selection = readSource(
    '../src/features/fiscal-catalog/fiscal-catalog-selection.tsx',
  );
  const catalogApi = readSource('../src/lib/fiscal-catalog-api.ts');
  for (const expected of [
    'confirmFiscalCatalogCabys',
    'FiscalCatalogSelection',
    'updateAdditionalServiceFiscalProfileStatus',
  ]) {
    assert.match(profileModal, new RegExp(expected));
  }
  for (const expected of [
    'searchFiscalCatalogCabys',
    'getFiscalCatalogUnits',
    'getFiscalCatalogTaxes',
    'getFiscalCatalogTaxRates',
    'Porcentaje fiscal de la tarifa seleccionada',
  ]) assert.match(`${selection}\n${catalogApi}`, new RegExp(expected));
});

test('saving closes the same modal and refreshes readiness without a page reload', () => {
  const page = readSource('../src/app/admin/pricing-configurations/page.tsx');
  assert.match(
    page,
    /const handleFiscalSaved[\s\S]*setSelectedFiscalItem\(null\)[\s\S]*getAdditionalServiceAdminCatalog\(\)[\s\S]*setCatalog\(refreshedCatalog\)/,
  );
  assert.doesNotMatch(page, /window\.location\.reload/);
});

test('catalog category stays on creation with the established labels', () => {
  const catalogModal = readSource(
    '../src/app/admin/pricing-configurations/additional-service-catalog-modal.tsx',
  );
  assert.match(catalogModal, /value="SERVICE">Servicio/);
  assert.match(catalogModal, /value="MERCHANDISE">Mercadería/);
  assert.doesNotMatch(
    readSource('../src/app/admin/pricing-configurations/additional-service-fiscal-profile-modal.tsx'),
    /fiscalItemCategory/,
  );
});

test('does not introduce a duplicate fiscal modal or fiscal API flow', () => {
  const page = readSource('../src/app/admin/pricing-configurations/page.tsx');
  assert.equal(
    page.match(/<AdditionalServiceFiscalProfileModal/g)?.length,
    1,
  );
  const api = readSource('../src/lib/additional-services-admin-api.ts');
  assert.equal(
    api.match(/export function createAdditionalServiceFiscalProfile/g)?.length,
    1,
  );
});

test('uses the existing authenticated catalog client only to create and surfaces API messages', () => {
  const api = readSource('../src/lib/additional-services-admin-api.ts');
  assert.match(api, /authenticatedFetch\(`\$\{apiBase\}\$\{path\}`/);
  assert.match(api, /sendCatalogRequest\("\/additional-services\/catalog", "POST"/);
  assert.doesNotMatch(api, /updateAdditionalServiceCatalog/);
  assert.match(api, /typeof message === "string" && message\.trim\(\)/);
  assert.doesNotMatch(api, /payload\.stack/);
});

test('keeps configuration controls ADMIN-only without changing operational Add-on selection', () => {
  const page = readSource('../src/app/admin/pricing-configurations/page.tsx');
  const operationalApi = readSource(
    '../src/lib/additional-services-catalog-api.ts',
  );
  assert.match(page, /role !== "ADMIN"/);
  assert.match(operationalApi, /additional-services\/catalog\/selectable/);
  assert.doesNotMatch(operationalApi, /createAdditionalServiceCatalog/);
});

test('does not hardcode travel classifications into travel forms', () => {
  const travelSources = [
    '../src/components/create-trip-modal.tsx',
    '../src/components/create-trip-form.tsx',
    '../src/components/travel-packages-manager.tsx',
  ]
    .map(readSource)
    .join('\n');
  assert.doesNotMatch(travelSources, /Paquete turístico internacional/);
  assert.doesNotMatch(travelSources, /Viaje \/ Tour nacional/);
});
