import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTenantDateTimeInput, tenantDateTimeInputToUtc } from '../src/shared/regional/business-date.ts';

test('Requirement deadlines round-trip through the tenant timezone instead of browser-local time', () => {
  const storedUtc = '2026-10-10T06:30:00.000Z';
  const input = formatTenantDateTimeInput(storedUtc, 'America/Costa_Rica');
  assert.equal(input, '2026-10-10T00:30');
  assert.equal(tenantDateTimeInputToUtc(input, 'America/Costa_Rica'), storedUtc);
});

test('Purchase timestamps use the same tenant-authoritative conversion', () => {
  const storedUtc = '2026-10-10T06:30:00.000Z';
  const input = formatTenantDateTimeInput(storedUtc, 'America/Costa_Rica');
  assert.equal(input, '2026-10-10T00:30');
  assert.equal(tenantDateTimeInputToUtc(input, 'America/Costa_Rica'), storedUtc);
});
