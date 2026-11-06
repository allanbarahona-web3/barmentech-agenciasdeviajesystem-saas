import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  formatBusinessDate,
  formatBusinessDateTime,
  formatTenantDateTimeInput,
  tenantDateTimeInputToUtc,
} from '../src/shared/regional/business-date.ts';

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const timesheet = source('app/my-timesheet/page.tsx');
const adminAttendance = source('app/admin/attendance/page.tsx');
const correctionModal = source('components/correction-edit-modal.tsx');
const correctionsModal = source('components/corrections-modal.tsx');
const adminCorrections = source('components/admin-attendance-corrections-dialog.tsx');

test('attendance instants display in Lima independently from the browser timezone', () => {
  const previousTimeZone = process.env.TZ;
  try {
    process.env.TZ = 'America/Costa_Rica';
    assert.equal(
      formatBusinessDateTime('2026-11-06T05:30:00.000Z', 'America/Lima'),
      '06/11/2026 00:30',
    );
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test('a Lima correction converts an intentional minute edit to UTC and leaves an original instant exact', () => {
  const originalClockOut = '2026-11-06T06:30:45.000Z';
  assert.equal(
    formatTenantDateTimeInput('2026-11-06T05:30:00.000Z', 'America/Lima'),
    '2026-11-06T00:30',
  );
  assert.equal(
    tenantDateTimeInputToUtc('2026-11-06T00:45', 'America/Lima'),
    '2026-11-06T05:45:00.000Z',
  );
  assert.equal(originalClockOut, '2026-11-06T06:30:45.000Z');
});

test('the stored workday is rendered as a calendar date without timezone conversion', () => {
  const previousTimeZone = process.env.TZ;
  try {
    process.env.TZ = 'Pacific/Auckland';
    assert.equal(formatBusinessDate('2026-11-06T05:00:00.000Z'), '06/11/2026');
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test('a mocked paginated admin item renders its stored workday separately from its Lima clock instant', () => {
  const response = {
    items: [{
      date: '2026-11-05T00:00:00.000Z',
      clockIn: '2026-11-06T05:30:00.000Z',
    }],
  };
  const [entry] = response.items;

  assert.equal(formatBusinessDate(entry.date), '05/11/2026');
  assert.equal(formatBusinessDateTime(entry.clockIn, 'America/Lima'), '06/11/2026 00:30');
});

test('active Attendance screens use tenant regional helpers rather than browser-local formatting', () => {
  for (const screen of [timesheet, adminAttendance]) {
    assert.match(screen, /useTenantRegional/);
    assert.match(screen, /useTenantDateTimeFormatter/);
    assert.match(screen, /tenantCalendarToday/);
    assert.match(screen, /isConfigured/);
  }
  assert.match(timesheet, /formatBusinessDate\(entry\.date\)/);
  assert.match(adminAttendance, /formatBusinessDate\(entry\.date\)/);
  assert.match(adminAttendance, />Jornada</);
  assert.match(timesheet, /formatTenantDateTime\(entry\.clockIn\)/);
  assert.doesNotMatch(timesheet, /toLocaleTimeString/);
  assert.doesNotMatch(adminAttendance, /formatBusinessDateTime\(entry\.clockIn\)/);
});

test('correction inputs use the tenant conversion helpers and retain unedited original instants', () => {
  assert.match(correctionModal, /formatTenantDateTimeInput/);
  assert.match(correctionModal, /tenantDateTimeInputToUtc/);
  assert.match(correctionModal, /originalClockIn/);
  assert.match(correctionModal, /originalClockOut/);
  assert.match(correctionModal, /step="60"/);
  assert.doesNotMatch(correctionModal, /new Date\(formData\.clockIn\)/);
  assert.match(correctionsModal, /useTenantDateTimeFormatter/);
  assert.match(adminCorrections, /useTenantDateTimeFormatter/);
});
