import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  catalogAdminFormForItem,
  catalogUsageLabels,
  createCatalogInput,
  hasAdditionalServiceUsage,
  updateCatalogInput,
  validateCatalogAdminForm,
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
  ['ADDITIONAL_SERVICE'],
  ['TRAVEL_PACKAGE'],
  ['INTERNAL_TRIP'],
  ['ADDITIONAL_SERVICE', 'TRAVEL_PACKAGE', 'INTERNAL_TRIP'],
]) {
  test(`creates catalog input with usages ${usages.join(', ')}`, () => {
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

test('rejects blank names, blank codes, and zero usages client-side', () => {
  assert.equal(
    validateCatalogAdminForm({
      code: '',
      name: 'Item',
      fiscalItemCategory: 'SERVICE',
      usages: ['ADDITIONAL_SERVICE'],
    }),
    'El código es requerido.',
  );
  assert.equal(
    validateCatalogAdminForm({
      code: 'ITEM',
      name: ' ',
      fiscalItemCategory: 'SERVICE',
      usages: ['ADDITIONAL_SERVICE'],
    }),
    'El nombre es requerido.',
  );
  assert.equal(
    validateCatalogAdminForm({
      code: 'ITEM',
      name: 'Item',
      fiscalItemCategory: 'SERVICE',
      usages: [],
    }),
    'Seleccione al menos un uso.',
  );
});

test('preloads usages and PATCHes only added or removed usages and changed metadata', () => {
  const initial = catalogAdminFormForItem(
    item(['ADDITIONAL_SERVICE', 'TRAVEL_PACKAGE']),
  );
  assert.deepEqual(initial.usages, ['ADDITIONAL_SERVICE', 'TRAVEL_PACKAGE']);

  assert.deepEqual(
    updateCatalogInput(
      initial,
      { ...initial, name: 'Tour fiscal', usages: ['TRAVEL_PACKAGE'] },
      false,
    ),
    { name: 'Tour fiscal', usages: ['TRAVEL_PACKAGE'] },
  );
  assert.deepEqual(updateCatalogInput(initial, initial, false), {});
});

test('travel-only items do not support Add-on pricing while Additional Services do', () => {
  assert.equal(hasAdditionalServiceUsage(item(['TRAVEL_PACKAGE'])), false);
  assert.equal(hasAdditionalServiceUsage(item(['INTERNAL_TRIP'])), false);
  assert.equal(
    hasAdditionalServiceUsage(item(['ADDITIONAL_SERVICE', 'TRAVEL_PACKAGE'])),
    true,
  );
});

test('reuses the existing profile modal and hides pricing actions for travel-only rows', () => {
  const page = readSource('../src/app/admin/pricing-configurations/page.tsx');
  const profileModal = readSource(
    '../src/app/admin/pricing-configurations/additional-service-fiscal-profile-modal.tsx',
  );
  assert.match(page, /AdditionalServiceFiscalProfileModal/);
  assert.match(page, /supportsPricing \? <Button/);
  assert.match(page, /No aplica/);
  assert.match(profileModal, /updateAdditionalServiceFiscalProfile/);
  assert.match(profileModal, /createAdditionalServiceFiscalProfile/);
});

test('uses the existing authenticated catalog client for POST and PATCH and surfaces API messages', () => {
  const api = readSource('../src/lib/additional-services-admin-api.ts');
  assert.match(api, /authenticatedFetch\(`\$\{apiBase\}\$\{path\}`/);
  assert.match(api, /sendCatalogRequest\("\/additional-services\/catalog", "POST"/);
  assert.match(api, /additional-services\/catalog\/\$\{encodeURIComponent\(catalogId\)\}/);
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
