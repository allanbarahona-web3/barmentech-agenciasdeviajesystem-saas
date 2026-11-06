import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  formatBusinessDate,
  formatBusinessDateTime,
} from '../src/shared/regional/business-date.ts';

const workspacePage = readFileSync(
  new URL('../src/app/additional-services/page.tsx', import.meta.url),
  'utf8',
);
const orderPage = readFileSync(
  new URL('../src/app/additional-services/orders/[id]/page.tsx', import.meta.url),
  'utf8',
);
const pricingReviewPage = readFileSync(
  new URL('../src/app/additional-services/pricing-review/page.tsx', import.meta.url),
  'utf8',
);

test('Additional Services travel dates retain their selected calendar day', () => {
  const mockedTravel = {
    startDate: '2026-11-23',
    endDate: '2026-11-30',
  };

  assert.equal(formatBusinessDate(mockedTravel.startDate), '23/11/2026');
  assert.equal(formatBusinessDate(mockedTravel.endDate), '30/11/2026');
  assert.match(workspacePage, /formatBusinessDate\(startDate\)/);
  assert.match(workspacePage, /formatBusinessDate\(endDate\)/);
  assert.doesNotMatch(workspacePage, /new Date\(startDate\)/);
});

test('Additional Services order timestamps use the tenant timezone, not browser time', () => {
  const mockedOrder = { createdAt: '2026-11-06T05:30:00Z' };
  const previousTimeZone = process.env.TZ;

  try {
    process.env.TZ = 'Europe/Madrid';
    assert.equal(
      formatBusinessDateTime(mockedOrder.createdAt, 'America/Costa_Rica'),
      '05/11/2026 23:30',
    );
    assert.equal(
      formatBusinessDateTime(mockedOrder.createdAt, 'America/Lima'),
      '06/11/2026 00:30',
    );
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }

  assert.match(orderPage, /useTenantDateTimeFormatter/);
  assert.match(orderPage, /formatTenantDateTime\(order\.createdAt\)/);
});

test('Additional Services sends and displays quotation validity as a calendar date', () => {
  const mockedValidity = '2026-11-23';

  assert.equal(formatBusinessDate(mockedValidity), '23/11/2026');
  assert.match(
    pricingReviewPage,
    /quotationValidUntil: commercialConditions\.quotationValidUntil\s*\? commercialConditions\.quotationValidUntil\s*:\s*undefined/,
  );
  assert.doesNotMatch(pricingReviewPage, /T23:59:59\.999-06:00/);
  assert.match(orderPage, /formatBusinessDate\(order\.quotationValidUntil\)/);
});
