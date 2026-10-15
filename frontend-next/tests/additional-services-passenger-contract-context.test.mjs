import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER,
  WITHOUT_ADDITIONAL_SERVICES_CONTRACT_FILTER,
  additionalServicesContractFilterValue,
  buildAdditionalServicesContractTagClasses,
  filterAdditionalServicesContractParticipants,
  toggleAdditionalServicesContractFilter,
} from '../src/lib/additional-services-contract-tags.ts';

const page = readFileSync(
  new URL('../src/app/additional-services/page.tsx', import.meta.url),
  'utf8',
);
const api = readFileSync(
  new URL('../src/lib/additional-services-workspace-api.ts', import.meta.url),
  'utf8',
);
const contextHeader = readFileSync(
  new URL('../src/components/additional-services-context-header.tsx', import.meta.url),
  'utf8',
);

const contract125 = { contractId: 'contract-db-id-125', contractNumber: 'CT-00125' };
const contract141 = { contractId: 'contract-db-id-141', contractNumber: 'CT-00141' };

test('contract tags are deterministic, reused for the same Contract, and distinct for different Contracts', () => {
  const tags = buildAdditionalServicesContractTagClasses([
    { contractSources: [contract141, contract125] },
    { contractSources: [contract125] },
  ]);
  const reorderedTags = buildAdditionalServicesContractTagClasses([
    { contractSources: [contract125] },
    { contractSources: [contract125, contract141] },
  ]);

  assert.equal(tags.size, 2);
  assert.equal(
    tags.get(contract125.contractId),
    reorderedTags.get(contract125.contractId),
  );
  assert.notEqual(tags.get(contract125.contractId), tags.get(contract141.contractId));
});

test('the Additional Services roster renders all contract references without rendering database IDs', () => {
  assert.match(api, /contractSources: TravelContextParticipantContractSource\[\]/);
  for (const field of ['contractId', 'contractNumber', 'status', 'sourceRole']) {
    assert.match(api, new RegExp(`${field}:`));
  }
  assert.match(page, /contractSource\.contractNumber/);
  assert.match(page, /Sin contrato asociado/);
  assert.doesNotMatch(page, />\{contractSource\.contractId\}</);
});

test('the roster keeps one participant selection path across Contract sources', () => {
  assert.match(page, /new Set\(\)/);
  assert.match(page, /toggleParticipant\(participant\.clientId\)/);
  assert.match(page, /selectedParticipantIds\.has\(\s*participant\.clientId/);
  assert.doesNotMatch(page, /contractSources\.flatMap/);
});

test('badge filters show every matching participant, including multi-Contract participants', () => {
  const roster = [
    { clientId: 'holder', contractSources: [contract125] },
    { clientId: 'companion', contractSources: [contract125, contract141] },
    { clientId: 'minor', contractSources: [contract125] },
    { clientId: 'other-holder', contractSources: [contract141] },
    { clientId: 'unassigned', contractSources: [] },
  ];

  assert.deepEqual(
    filterAdditionalServicesContractParticipants(
      roster,
      ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER,
    ).map((participant) => participant.clientId),
    ['holder', 'companion', 'minor', 'other-holder', 'unassigned'],
  );
  assert.deepEqual(
    filterAdditionalServicesContractParticipants(
      roster,
      additionalServicesContractFilterValue(contract125.contractNumber),
    ).map((participant) => participant.clientId),
    ['holder', 'companion', 'minor'],
  );
  assert.deepEqual(
    filterAdditionalServicesContractParticipants(
      roster,
      additionalServicesContractFilterValue(contract141.contractNumber),
    ).map((participant) => participant.clientId),
    ['companion', 'other-holder'],
  );
  assert.deepEqual(
    filterAdditionalServicesContractParticipants(
      roster,
      WITHOUT_ADDITIONAL_SERVICES_CONTRACT_FILTER,
    ).map((participant) => participant.clientId),
    ['unassigned'],
  );
});

test('badge filters toggle, switch, and clear without mutating selected passengers', () => {
  const filter125 = additionalServicesContractFilterValue(contract125.contractNumber);
  const filter141 = additionalServicesContractFilterValue(contract141.contractNumber);

  assert.equal(
    toggleAdditionalServicesContractFilter(
      ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER,
      filter125,
    ),
    filter125,
  );
  assert.equal(
    toggleAdditionalServicesContractFilter(filter125, filter141),
    filter141,
  );
  assert.equal(
    toggleAdditionalServicesContractFilter(filter141, filter141),
    ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER,
  );

  const selectedPassengerIds = new Set(['holder', 'unassigned']);
  filterAdditionalServicesContractParticipants(
    [
      { clientId: 'holder', contractSources: [contract125] },
      { clientId: 'unassigned', contractSources: [] },
    ],
    filter125,
  );
  assert.deepEqual([...selectedPassengerIds], ['holder', 'unassigned']);
});

test('the compact roster keeps role text separate from role-specific icons beside passenger names', () => {
  assert.match(page, /function ParticipantRow/);
  assert.match(page, /styles\.participantRow/);
  assert.match(page, /function ParticipantRoleIcon/);
  assert.match(page, /styles\.participantNameCell/);
  assert.match(page, /<ParticipantRoleIcon role=\{participant\.participantRole\} \/>/);
  assert.match(page, /<span className=\{styles\.role\}>\s*\{participantRoleLabel\(participant\.participantRole\)\}/);
  assert.match(page, /Crown|UserRound|Baby/);
  assert.match(page, /aria-hidden="true"/);
  assert.match(page, /styles\.roleIconHolder/);
  assert.match(page, /styles\.roleIconCompanion/);
  assert.match(page, /styles\.roleIconMinor/);
  for (const roleLabel of ['Titular', 'Acompañante', 'Menor']) {
    assert.match(page, new RegExp(`return '${roleLabel}'`));
  }
  assert.match(page, /onFilterByContract/);
  assert.match(page, /additionalServicesContractFilterValue\(contractNumber\)/);
  assert.match(page, /onFilterWithoutContract/);
  assert.match(page, /selectedParticipantIds\.size/);
  assert.match(page, /Filtrando por contrato:/);
  assert.match(page, />\s*Limpiar\s*</);
  assert.match(
    page,
    /onClick=\{\(\) =>\s*setContractFilter\(\s*ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER/,
  );
  assert.doesNotMatch(page, /<Select|contract-filter|buildAdditionalServicesContractFilterOptions/);
  assert.doesNotMatch(page, /ParticipantCard|PARTICIPANT_GROUPS|Responsable del viaje/);
});

test('the travel summary keeps four main fields and places the copyable Contract reference below them', () => {
  for (const label of ['Viaje', 'Tipo', 'Destino', 'Fechas']) {
    assert.match(page, new RegExp(`>${label}<`));
  }
  assert.match(page, /styles\.summaryFields/);
  assert.match(page, /styles\.summaryContract/);
  assert.ok(page.indexOf('styles.summaryFields') < page.indexOf('styles.summaryContract'));
  assert.match(contextHeader, /navigator\.clipboard\.writeText\(contractNumber\)/);
});
