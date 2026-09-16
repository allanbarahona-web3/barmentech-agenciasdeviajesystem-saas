export const DEFAULT_FISCAL_TIMEZONE = "America/Costa_Rica";

export type TenantCalendarDate = {
  year: number;
  month: number;
  day: number;
};

export function tenantCalendarDateStartAsUtc(calendarDate: string, timezone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(calendarDate);
  if (!match) throw new Error("FINANCE_TENANT_CALENDAR_DATE_INVALID");
  const value = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const instant = new Date(Date.UTC(value.year, value.month - 1, value.day));
  if (
    instant.getUTCFullYear() !== value.year ||
    instant.getUTCMonth() !== value.month - 1 ||
    instant.getUTCDate() !== value.day
  ) {
    throw new Error("FINANCE_TENANT_CALENDAR_DATE_INVALID");
  }
  return tenantLocalMidnightAsUtc(value, timezone);
}

export function nextTenantCalendarDate(calendarDate: string): string {
  const date = tenantCalendarDateStartAsUtc(calendarDate, "UTC");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function tenantLocalMidnightAsUtc(
  calendarDate: TenantCalendarDate,
  timezone: string,
): Date {
  const localMidnightAsUtc = Date.UTC(
    calendarDate.year,
    calendarDate.month - 1,
    calendarDate.day,
  );
  let candidate = localMidnightAsUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    candidate = localMidnightAsUtc - tenantTimezoneOffsetMilliseconds(new Date(candidate), timezone);
  }
  return new Date(candidate);
}

function tenantTimezoneOffsetMilliseconds(instant: Date, timezone: string): number {
  const timezoneName = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  }).formatToParts(instant).find((part) => part.type === "timeZoneName")?.value;
  if (!timezoneName || timezoneName === "GMT" || timezoneName === "UTC") return 0;
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(timezoneName);
  if (!match) throw new Error("FINANCE_TENANT_TIMEZONE_OFFSET_UNAVAILABLE");
  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  return sign * ((hours * 60 + minutes) * 60 * 1000);
}
