import { BadRequestException } from "@nestjs/common";
import { resolveTenantTimeZone } from "../common/utils/tenant-timezone";
import {
  calendarDateAsUtc,
  calendarDateFromUtcMidnight,
  tenantCalendarDateForInstant,
} from "../finance/tenant-fiscal-date";

type TenantTimeZoneReader = {
  tenantBillingConfiguration: {
    findUnique(input: unknown): Promise<{ fiscalTimezone: string | null } | null>;
  };
};

export function additionalServiceQuotationValidityDate(value: string): Date {
  try {
    return calendarDateAsUtc(value);
  } catch {
    throw new BadRequestException("ADDITIONAL_SERVICE_QUOTATION_VALID_UNTIL_INVALID");
  }
}

export function additionalServiceQuotationValidityCalendarDate(value: Date): string {
  try {
    return calendarDateFromUtcMidnight(value);
  } catch {
    throw new BadRequestException("ADDITIONAL_SERVICE_QUOTATION_VALID_UNTIL_INVALID");
  }
}

export function isAdditionalServiceQuotationValidityExpired(
  validUntil: Date | null,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!validUntil) return false;
  return (
    additionalServiceQuotationValidityCalendarDate(validUntil) <
    tenantCalendarDate(now, timezone)
  );
}

export async function assertAdditionalServiceQuotationNotExpired(
  database: TenantTimeZoneReader,
  tenantId: string,
  validUntil: Date | null,
  now: Date = new Date(),
): Promise<string> {
  const configuration = await database.tenantBillingConfiguration.findUnique({
    where: { tenantId },
    select: { fiscalTimezone: true },
  });
  const timezone = resolveTenantTimeZone(configuration?.fiscalTimezone);
  if (isAdditionalServiceQuotationValidityExpired(validUntil, timezone, now)) {
    throw new BadRequestException("ADDITIONAL_SERVICE_QUOTATION_EXPIRED");
  }
  return timezone;
}

function tenantCalendarDate(value: Date, timezone: string): string {
  try {
    return tenantCalendarDateForInstant(value, timezone);
  } catch {
    // Stored invalid zones remain invalid; do not silently substitute a zone.
    throw new BadRequestException("Tenant business timezone is invalid.");
  }
}
