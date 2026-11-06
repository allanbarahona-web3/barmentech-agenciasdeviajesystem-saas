import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_TENANT_TIMEZONE,
  addCalendarDays,
  calendarDayDifference,
  formatBusinessDate,
  formatBusinessDateTime,
  isCalendarDate,
  normalizeTenantTimeZone,
  tenantCalendarToday,
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
  assert.match(authServiceSource, /preferredCurrency: true/);
  assert.match(authApiSource, /preferredCurrency: string/);
  assert.match(authApiSource, /getAuthenticatedSessionProfile/);
  assert.match(authApiSource, /\/auth\/me/);
  assert.doesNotMatch(authApiSource, /admin\/fiscal-billing\/configuration/);
});

test('the root provider loads the authenticated tenant timezone and falls back safely', () => {
  assert.match(rootLayoutSource, /<TenantRegionalProvider>/);
  assert.match(providerSource, /getAuthenticatedSessionProfile/);
  assert.match(providerSource, /DEFAULT_TENANT_TIMEZONE/);
  assert.match(providerSource, /normalizeTenantTimeZone\(profile\.tenant\?\.fiscalTimezone\)/);
  assert.match(providerSource, /normalizeTenantCurrency\(profile\.tenant\?\.preferredCurrency\)/);
  assert.match(providerSource, /AUTH_SESSION_CHANGED_EVENT/);
  assert.match(providerSource, /refreshRegionalConfiguration/);
  assert.match(providerSource, /requestSequence/);
  assert.match(providerSource, /token !== getStoredToken\(\)/);
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

test('tenant-aware instant formatting is independent from the browser/runtime timezone', () => {
  const instant = '2026-09-20T03:43:00.000Z';
  const previousTimeZone = process.env.TZ;

  try {
    process.env.TZ = 'Pacific/Auckland';
    assert.equal(
      formatBusinessDateTime(instant, 'America/Costa_Rica'),
      '19/09/2026 21:43',
    );
    assert.equal(
      formatBusinessDateTime(instant, 'America/Mexico_City'),
      '19/09/2026 21:43',
    );
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }

  assert.equal(formatBusinessDate('2026-11-20'), '20/11/2026');
});

test('tenant calendar today derives its date from the supplied instant and tenant timezone', () => {
  const instant = new Date('2026-09-20T03:43:00.000Z');
  assert.equal(tenantCalendarToday('America/Costa_Rica', instant), '2026-09-19');
  assert.equal(tenantCalendarToday('UTC', instant), '2026-09-20');
  assert.equal(tenantCalendarToday('invalid/timezone', instant), '2026-09-19');
  assert.equal(tenantCalendarToday('UTC', 'not-an-instant'), '');
});

test('calendar-only primitives validate strictly and preserve calendar arithmetic', () => {
  assert.equal(isCalendarDate('2024-02-29'), true);
  assert.equal(isCalendarDate('2023-02-29'), false);
  assert.equal(isCalendarDate('2026-04-31'), false);
  assert.equal(isCalendarDate('2026-09-20T00:00:00.000Z'), false);

  assert.equal(addCalendarDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addCalendarDays('2024-02-29', 1), '2024-03-01');
  assert.equal(addCalendarDays('2025-01-01', -1), '2024-12-31');
  assert.equal(addCalendarDays('2026-09-20', 0), '2026-09-20');
  assert.equal(addCalendarDays('2023-02-29', 1), '');
  assert.equal(addCalendarDays('2026-09-20', 1.5), '');

  assert.equal(calendarDayDifference('2026-09-20', '2026-09-20'), 0);
  assert.equal(calendarDayDifference('2026-02-28', '2026-03-01'), 1);
  assert.equal(calendarDayDifference('2026-03-01', '2026-02-28'), -1);
  assert.equal(calendarDayDifference('2023-02-29', '2026-03-01'), null);
});

test('calendar-only primitives are independent from the runtime timezone, including DST', () => {
  const previousTimeZone = process.env.TZ;
  const evaluate = (timeZone) => {
    process.env.TZ = timeZone;
    return {
      today: tenantCalendarToday('America/New_York', new Date('2026-03-08T07:00:00.000Z')),
      added: addCalendarDays('2026-03-08', 1),
      difference: calendarDayDifference('2026-03-08', '2026-03-09'),
    };
  };

  try {
    assert.deepEqual(evaluate('UTC'), evaluate('Pacific/Auckland'));
    assert.deepEqual(evaluate('UTC'), evaluate('America/New_York'));
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
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
