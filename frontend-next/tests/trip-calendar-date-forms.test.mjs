import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  calendarDayDifference,
  formatBusinessDate,
  tenantCalendarToday,
  toLocalDateIso,
} from '../src/shared/regional/business-date.ts';

const createTripModal = readFileSync(
  new URL('../src/components/create-trip-modal.tsx', import.meta.url),
  'utf8',
);
const createTripForm = readFileSync(
  new URL('../src/components/create-trip-form.tsx', import.meta.url),
  'utf8',
);
const internalTripEdit = readFileSync(
  new URL('../src/app/admin/internal-trips/[id]/edit/page.tsx', import.meta.url),
  'utf8',
);
const travelPackagesManager = readFileSync(
  new URL('../src/components/travel-packages-manager.tsx', import.meta.url),
  'utf8',
);

test('trip create forms submit selected calendar dates without timestamp serialization', () => {
  for (const source of [createTripModal, createTripForm]) {
    assert.match(source, /tenantCalendarToday\(timeZone\)/);
    assert.match(source, /calendarDayDifference\(today, departureDate\)/);
    assert.match(source, /calendarDayDifference\(departureDate, returnDate\)/);
    assert.match(source, /departureDate,\s*\n\s*returnDate,/);
    assert.doesNotMatch(source, /new Date\(departureDate\)/);
    assert.doesNotMatch(source, /departureDateTime\.toISOString\(\)/);
  }
});

test('a mocked trip retains its date-only values after reopening and an unrelated edit', () => {
  const mockedApiTrip = {
    name: 'Viaje de prueba',
    departureDate: '2026-11-23T00:00:00.000Z',
    returnDate: '2026-11-30T00:00:00.000Z',
  };
  const previousTimeZone = process.env.TZ;

  try {
    for (const browserTimeZone of ['America/Costa_Rica', 'Europe/Madrid']) {
      process.env.TZ = browserTimeZone;
      const loadedDepartureDate = toLocalDateIso(mockedApiTrip.departureDate);
      const loadedReturnDate = toLocalDateIso(mockedApiTrip.returnDate);
      const updatePayload = {
        name: 'Viaje actualizado',
        departureDate: loadedDepartureDate,
        returnDate: loadedReturnDate,
      };

      assert.deepEqual(updatePayload, {
        name: 'Viaje actualizado',
        departureDate: '2026-11-23',
        returnDate: '2026-11-30',
      });
      assert.equal(formatBusinessDate(loadedDepartureDate), '23/11/2026');
      assert.equal(formatBusinessDate(loadedReturnDate), '30/11/2026');
    }
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }

  assert.match(internalTripEdit, /setDepartureDate\(toLocalDateIso\(data\.departureDate\)\)/);
  assert.match(internalTripEdit, /departureDate,\s*\n\s*returnDate,/);
  assert.doesNotMatch(internalTripEdit, /departureDateTime\.toISOString\(\)/);
});

test('trip calendar validation uses the tenant day and preserves strict date ordering', () => {
  const instant = '2026-11-23T05:30:00.000Z';
  assert.equal(tenantCalendarToday('America/Costa_Rica', instant), '2026-11-22');
  assert.equal(tenantCalendarToday('America/Lima', instant), '2026-11-23');
  assert.equal(calendarDayDifference('2026-11-23', '2026-11-30'), 7);
  assert.equal(calendarDayDifference('2026-11-30', '2026-11-23'), -7);

  assert.match(travelPackagesManager, /setDepartureDate\(toLocalDateIso\(pkg\.departureDate\)\)/);
  assert.match(travelPackagesManager, /departureDate,\s*\n\s*returnDate,/);
});
