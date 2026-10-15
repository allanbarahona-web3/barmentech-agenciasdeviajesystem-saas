import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const temporaryStore = readFileSync(
  new URL('../src/lib/additional-services-temporary-store.ts', import.meta.url),
  'utf8',
);
const pricingReview = readFileSync(
  new URL('../src/app/additional-services/pricing-review/page.tsx', import.meta.url),
  'utf8',
);
const ordersApi = readFileSync(
  new URL('../src/lib/additional-services-orders-api.ts', import.meta.url),
  'utf8',
);

const catalogFormPaths = [
  'accommodation-type',
  'accommodation',
  'baggage',
  'event-tickets',
  'extend-trip',
  'insurance',
  'seat-selection',
  'shorten-trip',
  'tickets',
  'tours',
  'transportation',
  'visa-assistance',
];

const catalogForms = catalogFormPaths.map((catalogPath) =>
  readFileSync(
    new URL(
      `../src/app/additional-services/catalog/${catalogPath}/page.tsx`,
      import.meta.url,
    ),
    'utf8',
  ),
);

test('temporary Additional Service lines retain a separate customer-facing note value', () => {
  assert.equal(
    (temporaryStore.match(/customerFacingNotes\?: string;/g) ?? []).length,
    12,
  );

  for (const form of catalogForms) {
    assert.match(form, /editingLine\?\.customerFacingNotes \?\? ''/);
    assert.match(
      form,
      /customerFacingNotes: customerFacingNotes\.trim\(\)/,
    );
  }
});

test('catalog forms distinguish internal and customer-facing notes', () => {
  for (const form of catalogForms) {
    assert.match(form, />Observación interna</);
    assert.match(form, /Solo visible para el equipo interno\./);
    assert.match(form, /Nota para el cliente \(opcional\)/);
    assert.match(form, /Esta nota aparecerá en la propuesta del cliente\./);
  }
});

test('pricing review maps the two note authorities independently and omits blank customer notes', () => {
  assert.match(ordersApi, /commercialNotes\?: string;/);
  assert.match(ordersApi, /customerFacingNotes\?: string;/);
  assert.match(
    pricingReview,
    /commercialNotes: line\.notes\.trim\(\) \|\| undefined/,
  );
  assert.match(
    pricingReview,
    /customerFacingNotes: line\.customerFacingNotes\?\.trim\(\) \|\| undefined/,
  );
  assert.doesNotMatch(pricingReview, /customerFacingNotes:\s*line\.notes/);
  assert.doesNotMatch(pricingReview, /commercialNotes:\s*line\.customerFacingNotes/);
});
