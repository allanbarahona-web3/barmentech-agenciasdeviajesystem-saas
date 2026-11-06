const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const STRICT_BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const DEFAULT_TENANT_TIMEZONE = "America/Costa_Rica";

export const normalizeTenantTimeZone = (value: string | null | undefined): string => {
  const timeZone = String(value ?? "").trim();
  if (!timeZone) return DEFAULT_TENANT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return timeZone;
  } catch {
    return DEFAULT_TENANT_TIMEZONE;
  }
};

export const toLocalDateIso = (dateString: string): string => {
  const match = dateString.trim().match(BUSINESS_DATE_PATTERN);
  if (!match) return "";

  const [, year, month, day] = match;
  return calendarDateFromParts(Number(year), Number(month), Number(day));
};

/** True only for a complete, valid YYYY-MM-DD calendar date. */
export const isCalendarDate = (value: string): boolean =>
  STRICT_BUSINESS_DATE_PATTERN.test(value) && toLocalDateIso(value) === value;

/** Reads the backend's UTC-midnight DATE carrier without timezone conversion. */
export const calendarDateFromUtcMidnight = (value: string | null | undefined): string => {
  if (!value) return "";
  if (isCalendarDate(value)) return value;
  const match = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/.exec(value);
  return match && isCalendarDate(match[1]) ? match[1] : "";
};

/**
 * Returns the tenant calendar date for an instant as YYYY-MM-DD.
 *
 * Invalid instants return an empty string, matching the existing date-only
 * helper convention. The optional instant makes this deterministic in tests.
 */
export const tenantCalendarToday = (
  timeZone = DEFAULT_TENANT_TIMEZONE,
  instant: Date | string | number = new Date(),
): string => {
  const date = instant instanceof Date ? new Date(instant.getTime()) : new Date(instant);
  if (Number.isNaN(date.getTime())) return "";

  const parts = dateTimeParts(date, timeZone);
  return calendarDateFromParts(Number(parts.year), Number(parts.month), Number(parts.day));
};

/**
 * Adds whole calendar days to a YYYY-MM-DD date without using local time.
 *
 * Negative values subtract days. Invalid dates, non-integer offsets, and
 * results outside YYYY-MM-DD return an empty string.
 */
export const addCalendarDays = (value: string, days: number): string => {
  if (!isCalendarDate(value) || !Number.isSafeInteger(days)) return "";

  const [year, month, day] = value.split("-").map(Number);
  const date = utcCalendarDate(year, month, day);
  date.setUTCDate(date.getUTCDate() + days);
  if (Number.isNaN(date.getTime())) return "";

  return calendarDateFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};

/**
 * Returns whole calendar days from start through end: end minus start.
 *
 * A later end is positive, an earlier end is negative, and equal dates are
 * zero. Invalid calendar dates return null.
 */
export const calendarDayDifference = (start: string, end: string): number | null => {
  if (!isCalendarDate(start) || !isCalendarDate(end)) return null;

  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  const startDate = utcCalendarDate(startYear, startMonth, startDay);
  const endDate = utcCalendarDate(endYear, endMonth, endDay);
  return (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000);
};

export const formatBusinessDate = (dateString: string): string => {
  const isoDate = toLocalDateIso(dateString);
  if (!isoDate) return "-";

  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
};

export const formatBusinessDateTime = (
  dateString: string,
  timeZone = DEFAULT_TENANT_TIMEZONE,
): string => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";

  const parts = new Intl.DateTimeFormat('es-CR', {
    timeZone: normalizeTenantTimeZone(timeZone),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const day = part('day');
  const month = part('month');
  const year = part('year');
  const hour = part('hour');
  const minute = part('minute');

  if (!day || !month || !year || !hour || !minute) return "-";
  return `${day}/${month}/${year} ${hour}:${minute}`;
};

/** Converts an instant to the value expected by a datetime-local input in tenant time. */
export const formatTenantDateTimeInput = (dateString: string, timeZone = DEFAULT_TENANT_TIMEZONE): string => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  const parts = dateTimeParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

/** Converts a tenant-local datetime-local value to its UTC persistence instant. */
export const tenantDateTimeInputToUtc = (value: string, timeZone = DEFAULT_TENANT_TIMEZONE): string | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const target = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let timestamp = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = dateTimeParts(new Date(timestamp), timeZone);
    const representedAsUtc = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), Number(local.hour), Number(local.minute));
    const difference = representedAsUtc - target;
    if (difference === 0) break;
    timestamp -= difference;
  }
  return new Date(timestamp).toISOString();
};

function dateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: normalizeTenantTimeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute') };
}

function utcCalendarDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function calendarDateFromParts(year: number, month: number, day: number): string {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || !Number.isInteger(day)) return "";
  const date = utcCalendarDate(year, month, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const formatBusinessTimestampDate = (dateString: string): string => {
  const dateTime = formatBusinessDateTime(dateString);
  return dateTime === "-" ? "-" : dateTime.split(' ')[0];
};
