import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  additionalServicesContractTagKey,
  buildAdditionalServicesContractTagClasses,
} from '../src/lib/additional-services-contract-tags.ts';

const page = readFileSync(
  new URL('../src/app/additional-services/orders/[id]/page.tsx', import.meta.url),
  'utf8',
);
const api = readFileSync(
  new URL('../src/lib/additional-services-orders-api.ts', import.meta.url),
  'utf8',
);

test('internal order Contract tags use the visible number when no raw identifier is exposed', () => {
  const first = { contractNumber: 'CT-00125' };
  const second = { contractNumber: 'CT-00141' };
  const tags = buildAdditionalServicesContractTagClasses([
    { contractSources: [second, first] },
    { contractSources: [first] },
  ]);

  assert.equal(additionalServicesContractTagKey(first), 'CT-00125');
  assert.equal(tags.get('CT-00125'), buildAdditionalServicesContractTagClasses([
    { contractSources: [first, second] },
  ]).get('CT-00125'));
  assert.notEqual(tags.get('CT-00125'), tags.get('CT-00141'));
});

test('the order-detail API and UI expose only display-safe Contract context with historical fallbacks', () => {
  assert.match(api, /interface AdditionalServiceOrderParticipantContractSource/);
  for (const field of ['contractNumber', 'status', 'sourceRole']) {
    assert.match(api, new RegExp(`${field}:`));
  }
  assert.doesNotMatch(
    api.slice(api.indexOf('interface AdditionalServiceOrderParticipantContractSource'), api.indexOf('export type AdditionalServiceOrderCurrency')),
    /contractId/,
  );
  assert.match(page, /participant\.contractSources\.map/);
  assert.match(page, /contractSource\.contractNumber/);
  assert.match(page, /Sin contexto contractual registrado/);
  assert.match(page, /Sin contrato asociado/);
  assert.doesNotMatch(page, />\{contractSource\.contractId\}</);
});

test('the order-detail participant list continues to de-duplicate persisted participant rows', () => {
  assert.match(
    page,
    /new Map<\s*string,\s*AdditionalServiceOrderParticipant\s*>\(\)/,
  );
  assert.match(page, /persistedParticipants\.set\(participantKey\(participant\), participant\)/);
});
