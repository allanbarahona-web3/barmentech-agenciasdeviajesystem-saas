import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatBusinessDateTime } from '../src/shared/regional/business-date.ts';

const employeeDocuments = readFileSync(
  new URL('../src/features/employees/employee-documents-section.tsx', import.meta.url),
  'utf8',
);
const fiscalConfiguration = readFileSync(
  new URL('../src/app/admin/fiscal-billing/page.tsx', import.meta.url),
  'utf8',
);
const fiscalIssuers = readFileSync(
  new URL('../src/app/admin/fiscal-billing/issuers/page.tsx', import.meta.url),
  'utf8',
);
const fiscalIssuerActivities = readFileSync(
  new URL('../src/app/admin/fiscal-billing/issuers/[issuerId]/activities/page.tsx', import.meta.url),
  'utf8',
);

const formatUploadDate = (document, timeZone) =>
  formatBusinessDateTime(document.uploadedAt, timeZone).split(' ')[0];

test('tenant-scoped upload events preserve the tenant calendar date at a UTC midnight boundary', () => {
  const mockedDocument = { uploadedAt: '2026-11-06T05:30:00Z' };
  const previousTimeZone = process.env.TZ;

  try {
    process.env.TZ = 'Pacific/Auckland';
    assert.equal(
      formatUploadDate(mockedDocument, 'America/Costa_Rica'),
      '05/11/2026',
    );
    assert.equal(
      formatUploadDate(mockedDocument, 'America/Lima'),
      '06/11/2026',
    );
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test('tenant-scoped event rows use the shared formatter without browser-local date formatting', () => {
  for (const source of [employeeDocuments, fiscalConfiguration, fiscalIssuers, fiscalIssuerActivities]) {
    assert.match(source, /useTenantDateTimeFormatter/);
    assert.doesNotMatch(source, /toLocaleDateString|Intl\.DateTimeFormat/);
  }

  assert.match(employeeDocuments, /formatUploadDate\(doc\.uploadedAt\)/);
  assert.match(fiscalConfiguration, /formatTenantDateTime\(updatedAt\)/);
  assert.match(fiscalIssuers, /formatTenantDateTime\(issuer\.updatedAt\)/);
  assert.match(fiscalIssuerActivities, /formatTenantDateTime\(activity\.updatedAt\)/);
});
