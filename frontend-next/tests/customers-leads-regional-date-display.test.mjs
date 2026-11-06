import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  formatBusinessDate,
  formatBusinessDateTime,
} from '../src/shared/regional/business-date.ts';

const customerForm = readFileSync(
  new URL('../src/features/customers/components/CustomerForm.tsx', import.meta.url),
  'utf8',
);
const customerList = readFileSync(
  new URL('../src/app/admin/customers/page.tsx', import.meta.url),
  'utf8',
);
const customerDetail = readFileSync(
  new URL('../src/app/admin/customers/[id]/page.tsx', import.meta.url),
  'utf8',
);
const leadsList = readFileSync(
  new URL('../src/app/leads/page.tsx', import.meta.url),
  'utf8',
);
const leadDetail = readFileSync(
  new URL('../src/app/leads/[id]/page.tsx', import.meta.url),
  'utf8',
);

test('customer instants use tenant calendar dates independently of browser timezone', () => {
  const createdAt = '2026-11-06T05:30:00Z';
  const previousTimeZone = process.env.TZ;

  try {
    process.env.TZ = 'Europe/Madrid';
    assert.equal(
      formatBusinessDateTime(createdAt, 'America/Costa_Rica').split(' ')[0],
      '05/11/2026',
    );
    assert.equal(
      formatBusinessDateTime(createdAt, 'America/Lima').split(' ')[0],
      '06/11/2026',
    );
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }

  for (const source of [customerForm, customerList, customerDetail]) {
    assert.match(source, /useTenantDateTimeFormatter/);
    assert.match(source, /formatTenantDateTime\(value\)\.split\(' '\)\[0\]/);
    assert.doesNotMatch(source, /toLocaleDateString/);
  }
});

test('customer date of birth remains a calendar date', () => {
  assert.equal(formatBusinessDate('1990-11-23'), '23/11/1990');
  assert.match(customerForm, /formatBusinessDate\(customer\.dateOfBirth\)/);
  assert.match(customerDetail, /formatBusinessDate\(customer\.dateOfBirth\)/);
});

test('active Leads routes remain tenant-timezone aligned', () => {
  assert.match(leadsList, /formatTenantDateTime\(lead\.createdAt\)/);
  assert.match(leadDetail, /formatTenantDateTime\(lead\.createdAt\)/);
  assert.match(leadDetail, /formatTenantDateTime\(lead\.updatedAt\)/);
  assert.match(leadDetail, /formatBusinessDate\(quotation\.quotationValidUntil\)/);
});
