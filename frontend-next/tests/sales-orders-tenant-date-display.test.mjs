import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatBusinessDateTime } from '../src/shared/regional/business-date.ts';

const salesOrdersList = readFileSync(
  new URL('../src/app/sales-orders/page.tsx', import.meta.url),
  'utf8',
);
const salesOrderDetail = readFileSync(
  new URL('../src/app/sales-orders/[id]/page.tsx', import.meta.url),
  'utf8',
);
const fiscalSalesOrdersList = readFileSync(
  new URL('../src/app/fiscal-billing/sales-orders/page.tsx', import.meta.url),
  'utf8',
);
const fiscalDocument = readFileSync(
  new URL('../src/app/fiscal-billing/documents/[billingDocumentId]/page.tsx', import.meta.url),
  'utf8',
);

const formatOrderCreatedDate = (order, timeZone) =>
  formatBusinessDateTime(order.createdAt, timeZone).split(' ')[0];

test('active Sales Order created-at dates follow the tenant timezone, not browser timezone', () => {
  const mockedOrder = { createdAt: '2026-11-06T05:30:00Z' };
  const previousTimeZone = process.env.TZ;

  try {
    process.env.TZ = 'Pacific/Auckland';
    assert.equal(
      formatOrderCreatedDate(mockedOrder, 'America/Costa_Rica'),
      '05/11/2026',
    );
    assert.equal(
      formatOrderCreatedDate(mockedOrder, 'America/Lima'),
      '06/11/2026',
    );
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test('active Sales Order routes render createdAt with the shared tenant formatter', () => {
  for (const source of [salesOrdersList, salesOrderDetail, fiscalSalesOrdersList]) {
    assert.match(source, /useTenantDateTimeFormatter/);
    assert.match(source, /formatTenantDateTime\(value\)\.split\(' '\)\[0\]/);
    assert.doesNotMatch(source, /function formatDate/);
  }

  assert.match(salesOrdersList, /formatTenantDate\(order\.createdAt\)/);
  assert.match(salesOrderDetail, /formatTenantDate\(order\.createdAt\)/);
  assert.match(fiscalSalesOrdersList, /formatTenantDate\(order\.createdAt\)/);
});

test('linked fiscal workspaces format provider event instants without changing fiscal dates', () => {
  assert.match(fiscalDocument, /useTenantDateTimeFormatter/);
  assert.match(fiscalDocument, /formatTenantInstant\(w\.submittedAt\)/);
  assert.match(fiscalDocument, /formatTenantInstant\(w\.issuedAt\)/);
  assert.doesNotMatch(fiscalDocument, /timeZone:'America\/Costa_Rica'/);
  assert.match(fiscalDocument, /date\(w\.fiscalIssueDate\)/);
});
