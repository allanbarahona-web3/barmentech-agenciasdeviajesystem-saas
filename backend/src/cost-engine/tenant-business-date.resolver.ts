import { BadRequestException, Injectable } from "@nestjs/common";
import { DEFAULT_FISCAL_TIMEZONE } from "../finance/tenant-fiscal-date";

type TenantTimezoneTransaction = {
  tenantBillingConfiguration: {
    findUnique(args: unknown): Promise<{ fiscalTimezone: string } | null>;
  };
};

@Injectable()
export class TenantBusinessDateResolver {
  async resolve(tx: TenantTimezoneTransaction, tenantId: string, now: Date = new Date()): Promise<Date> {
    const configuration = await tx.tenantBillingConfiguration.findUnique({
      where: { tenantId },
      select: { fiscalTimezone: true },
    });
    const calendarDate = tenantCalendarDate(now, configuration?.fiscalTimezone || DEFAULT_FISCAL_TIMEZONE);
    return new Date(`${calendarDate}T00:00:00.000Z`);
  }
}

export function tenantCalendarDate(instant: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    const year = value("year");
    const month = value("month");
    const day = value("day");
    if (!year || !month || !day) throw new Error("missing date part");
    return `${year}-${month}-${day}`;
  } catch {
    throw new BadRequestException("Tenant business timezone is invalid.");
  }
}
