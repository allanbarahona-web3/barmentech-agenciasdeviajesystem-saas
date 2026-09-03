import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canConfigureTravelFiscalClassification,
  hasTravelFiscalBillingCapability,
  selectionForUsageChange,
  travelFiscalUsageForType,
  withFiscalClassification,
} from '../src/lib/travel-fiscal-classification.ts';

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('maps International and Migration to TRAVEL_PACKAGE and Internal to INTERNAL_TRIP', () => {
  assert.equal(travelFiscalUsageForType('international'), 'TRAVEL_PACKAGE');
  assert.equal(travelFiscalUsageForType('migration'), 'TRAVEL_PACKAGE');
  assert.equal(travelFiscalUsageForType('internal'), 'INTERNAL_TRIP');
});

test('preserves compatible selection and clears it across incompatible usages', () => {
  assert.equal(
    selectionForUsageChange(
      'TRAVEL_PACKAGE',
      'TRAVEL_PACKAGE',
      'catalog-1',
    ),
    'catalog-1',
  );
  assert.equal(
    selectionForUsageChange(
      'TRAVEL_PACKAGE',
      'INTERNAL_TRIP',
      'catalog-1',
    ),
    '',
  );
  assert.equal(
    selectionForUsageChange(
      'INTERNAL_TRIP',
      'TRAVEL_PACKAGE',
      'catalog-2',
    ),
    '',
  );
});

test('enables fiscal controls only for ADMIN with configured electronic billing', () => {
  assert.equal(canConfigureTravelFiscalClassification('ADMIN'), true);
  assert.equal(canConfigureTravelFiscalClassification('AGENT'), false);
  assert.equal(canConfigureTravelFiscalClassification('OPERACIONES'), false);
  assert.equal(canConfigureTravelFiscalClassification('CONTADOR'), false);

  assert.equal(
    hasTravelFiscalBillingCapability({
      configured: true,
      configuration: {
        billingEnabled: true,
        electronicIssuanceEnabled: true,
      },
    }),
    true,
  );
  assert.equal(
    hasTravelFiscalBillingCapability({
      configured: true,
      configuration: {
        billingEnabled: true,
        electronicIssuanceEnabled: false,
      },
    }),
    false,
  );
  assert.equal(
    hasTravelFiscalBillingCapability({
      configured: false,
      configuration: {
        billingEnabled: false,
        electronicIssuanceEnabled: false,
      },
    }),
    false,
  );
});

test('adds only the selected catalog ID and supports clearing without changing price or currency', () => {
  const commercialPayload = { packagePrice: 1250, priceCurrency: 'USD' };
  assert.deepEqual(
    withFiscalClassification(commercialPayload, true, 'catalog-1'),
    {
      packagePrice: 1250,
      priceCurrency: 'USD',
      fiscalClassificationCatalogId: 'catalog-1',
    },
  );
  assert.deepEqual(withFiscalClassification(commercialPayload, true, ''), {
    packagePrice: 1250,
    priceCurrency: 'USD',
    fiscalClassificationCatalogId: null,
  });
  assert.deepEqual(
    withFiscalClassification(commercialPayload, false, 'catalog-1'),
    commercialPayload,
  );
});

test('uses the tenant-scoped selector endpoint and existing fiscal configuration client', () => {
  const apiSource = readSource(
    '../src/lib/travel-fiscal-classifications-api.ts',
  );
  const fieldSource = readSource(
    '../src/components/travel-fiscal-classification-field.tsx',
  );

  assert.match(
    apiSource,
    /additional-services\/catalog\/travel-fiscal-classifications/,
  );
  assert.match(apiSource, /params:\s*\{ usage \}/);
  assert.match(fieldSource, /getTenantBillingConfiguration/);
  assert.match(fieldSource, /listTravelFiscalClassifications\(usage\)/);
  assert.match(fieldSource, /optionsRequests/);
  assert.match(fieldSource, /No hay clasificaciones fiscales configuradas/);
});

test('wires create and edit payloads while loading existing selections', () => {
  const createSource = readSource('../src/components/create-trip-modal.tsx');
  const packageManagerSource = readSource(
    '../src/components/travel-packages-manager.tsx',
  );
  const internalEditorSource = readSource(
    '../src/app/admin/internal-trips/components/internal-trips-list.tsx',
  );

  assert.match(createSource, /travelFiscalUsageForType\(tripType\)/);
  assert.match(createSource, /withFiscalClassification/);
  assert.match(packageManagerSource, /pkg\.fiscalClassificationCatalogId/);
  assert.match(packageManagerSource, /withFiscalClassification/);
  assert.match(internalEditorSource, /trip\.fiscalClassificationCatalogId/);
  assert.match(internalEditorSource, /withFiscalClassification/);
});

test('does not introduce Add-on pricing or order calls', () => {
  const sources = [
    '../src/lib/travel-fiscal-classification.ts',
    '../src/lib/travel-fiscal-classifications-api.ts',
    '../src/components/travel-fiscal-classification-field.tsx',
    '../src/components/create-trip-modal.tsx',
  ]
    .map(readSource)
    .join('\n');

  assert.doesNotMatch(sources, /pricing-configurations/);
  assert.doesNotMatch(sources, /additional-services\/orders/);
  assert.doesNotMatch(sources, /AdditionalServiceOrder/);
});
