import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_TENANT_TIMEZONE,
  formatBusinessDate,
  formatBusinessDateTime,
  normalizeTenantTimeZone,
} from '../src/shared/regional/business-date.ts';

const businessDateSource = readFileSync(
  new URL('../src/shared/regional/business-date.ts', import.meta.url),
  'utf8',
);
const providerSource = readFileSync(
  new URL('../src/shared/regional/tenant-regional-provider.tsx', import.meta.url),
  'utf8',
);
const authApiSource = readFileSync(new URL('../src/lib/auth-api.ts', import.meta.url), 'utf8');
const authServiceSource = readFileSync(new URL('../../backend/src/auth/auth.service.ts', import.meta.url), 'utf8');
const rootLayoutSource = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
const pendingPaymentsSource = readFileSync(new URL('../src/app/admin/pending-payments/page.tsx', import.meta.url), 'utf8');
const customerProfileSource = readFileSync(new URL('../src/app/admin/customers/[id]/page.tsx', import.meta.url), 'utf8');
const paymentsViewSource = readFileSync(new URL('../src/app/finance/accounts-receivable/payments-view.tsx', import.meta.url), 'utf8');
const acceptedInvoiceSource = readFileSync(new URL('../src/app/fiscal-billing/invoices/[billingDocumentId]/page.tsx', import.meta.url), 'utf8');

test('authenticated bootstrap exposes the current tenant fiscal timezone without using the admin configuration route', () => {
  assert.match(authServiceSource, /billingConfiguration:[\s\S]*fiscalTimezone: true/);
  assert.match(authServiceSource, /fiscalTimezone:[\s\S]*billingConfiguration\?\.fiscalTimezone/);
  assert.match(authApiSource, /getAuthenticatedSessionProfile/);
  assert.match(authApiSource, /\/auth\/me/);
  assert.doesNotMatch(authApiSource, /admin\/fiscal-billing\/configuration/);
});

test('the root provider loads the authenticated tenant timezone and falls back safely', () => {
  assert.match(rootLayoutSource, /<TenantRegionalProvider>/);
  assert.match(providerSource, /getAuthenticatedSessionProfile/);
  assert.match(providerSource, /DEFAULT_TENANT_TIMEZONE/);
  assert.match(providerSource, /normalizeTenantTimeZone\(profile\.tenant\?\.fiscalTimezone\)/);
  assert.match(providerSource, /AUTH_SESSION_CHANGED_EVENT/);
});

test('the shared formatter accepts an explicit tenant timezone while date-only helpers remain date-only', () => {
  assert.match(businessDateSource, /formatBusinessDateTime[\s\S]*timeZone = DEFAULT_TENANT_TIMEZONE/);
  assert.match(businessDateSource, /timeZone: normalizeTenantTimeZone\(timeZone\)/);
  assert.match(businessDateSource, /formatBusinessDate = \(dateString: string\)/);
  assert.match(businessDateSource, /return `\$\{day\}\/\$\{month\}\/\$\{year\}`/);
  assert.doesNotMatch(businessDateSource, /formatBusinessDate[\s\S]{0,160}timeZone:/);
});

test('the shared formatter renders UTC instants in the configured tenant timezone without shifting date-only values', () => {
  assert.equal(
    formatBusinessDateTime('2026-09-14T03:30:00.000Z', 'America/Costa_Rica'),
    '13/09/2026 21:30',
  );
  assert.equal(
    formatBusinessDateTime('2026-09-14T03:30:00.000Z', 'UTC'),
    '14/09/2026 03:30',
  );
  assert.equal(formatBusinessDate('2026-09-14'), '14/09/2026');
  assert.equal(normalizeTenantTimeZone('invalid/timezone'), DEFAULT_TENANT_TIMEZONE);
});

test('critical operational timestamp consumers use the shared tenant formatter', () => {
  for (const source of [pendingPaymentsSource, customerProfileSource, paymentsViewSource]) {
    assert.match(source, /useTenantDateTimeFormatter/);
    assert.match(source, /formatTenantDateTime/);
  }
  assert.doesNotMatch(pendingPaymentsSource, /formatBusinessDateTime\(payment\.receivedAt\)/);
});

test('accepted invoice date-only rendering no longer hardcodes UTC', () => {
  assert.match(acceptedInvoiceSource, /formatBusinessDate\(value\)/);
  assert.doesNotMatch(acceptedInvoiceSource, /timeZone: 'UTC'/);
});
