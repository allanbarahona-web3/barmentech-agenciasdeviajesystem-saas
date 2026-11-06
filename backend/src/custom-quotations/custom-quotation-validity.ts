import { BadRequestException } from "@nestjs/common";
import { tenantCalendarDateForInstant } from "../finance/tenant-fiscal-date";

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Custom quotation validity is a calendar date, not an instant. Persistence
 * keeps the established UTC-midnight encoding solely as a stable DATE carrier.
 */
export function customQuotationValidityDate(value: string): Date {
  const match = CALENDAR_DATE.exec(value);
  if (!match) throw invalidValidityDate();

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw invalidValidityDate();
  }
  return date;
}

/**
 * Reads only the established UTC-midnight representation. A historical value
 * carrying a time component is ambiguous: it may have been an instant accepted
 * by the former broad ISO input, so it is not silently reinterpreted here.
 */
export function canonicalCustomQuotationValidityDate(value: Date): string {
  if (
    !Number.isFinite(value.getTime())
    || value.getUTCHours() !== 0
    || value.getUTCMinutes() !== 0
    || value.getUTCSeconds() !== 0
    || value.getUTCMilliseconds() !== 0
  ) {
    throw new BadRequestException("CUSTOM_QUOTATION_VALID_UNTIL_LEGACY_ENCODING_AMBIGUOUS");
  }
  return calendarDateFromUtc(value);
}

/** A quotation is valid throughout validUntil and expires on the next local day. */
export function isCustomQuotationValidityExpired(
  validUntil: Date | null,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!validUntil) return false;
  return canonicalCustomQuotationValidityDate(validUntil) < tenantCalendarDate(now, timezone);
}

export function formatCustomQuotationValidityDate(validUntil: Date | null): string {
  if (!validUntil) return "No indicada";
  return canonicalCustomQuotationValidityDate(validUntil).split("-").reverse().join("/");
}

function calendarDateFromUtc(value: Date): string {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function tenantCalendarDate(value: Date, timezone: string): string {
  try {
    return tenantCalendarDateForInstant(value, timezone);
  } catch {
    // Retain the existing Custom Quotation behavior for invalid persisted zones.
    throw new BadRequestException("Tenant business timezone is invalid.");
  }
}

function invalidValidityDate(): BadRequestException {
  return new BadRequestException("CUSTOM_QUOTATION_VALID_UNTIL_INVALID");
}
