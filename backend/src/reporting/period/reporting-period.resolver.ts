import { Injectable } from "@nestjs/common";
import type { ResolvedReportingPeriod } from "../contracts/reporting.contracts";

export type ReportingPeriodSelection =
  | { kind: "TODAY" | "LAST_7_DAYS" | "LAST_15_DAYS" | "CURRENT_MONTH" | "PREVIOUS_MONTH" }
  | { kind: "CUSTOM"; startOn: string; endOn: string };

@Injectable()
export class ReportingPeriodResolver {
  resolve(
    selection: ReportingPeriodSelection,
    timezone: string,
    now = new Date(),
  ): ResolvedReportingPeriod {
    const today = calendarDateInTimezone(now, timezone);

    switch (selection.kind) {
      case "TODAY":
        return { startOn: today, endOn: today };
      case "LAST_7_DAYS":
        return { startOn: addDays(today, -6), endOn: today };
      case "LAST_15_DAYS":
        return { startOn: addDays(today, -14), endOn: today };
      case "CURRENT_MONTH":
        return { startOn: `${today.slice(0, 7)}-01`, endOn: endOfMonth(today.slice(0, 7)) };
      case "PREVIOUS_MONTH": {
        const previousMonth = addMonths(today.slice(0, 7), -1);
        return { startOn: `${previousMonth}-01`, endOn: endOfMonth(previousMonth) };
      }
      case "CUSTOM":
        assertCalendarDate(selection.startOn);
        assertCalendarDate(selection.endOn);
        if (selection.startOn > selection.endOn) throw new Error("REPORTING_CUSTOM_PERIOD_INVALID");
        return { startOn: selection.startOn, endOn: selection.endOn };
    }
  }
}

function calendarDateInTimezone(instant: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    if (!year || !month || !day) throw new Error("missing date part");
    return `${year}-${month}-${day}`;
  } catch {
    throw new Error("REPORTING_TIMEZONE_INVALID");
  }
}

function addDays(calendarDate: string, days: number): string {
  const date = new Date(`${calendarDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(yearMonth: string, months: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return date.toISOString().slice(0, 7);
}

function endOfMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function assertCalendarDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("REPORTING_CUSTOM_PERIOD_INVALID");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("REPORTING_CUSTOM_PERIOD_INVALID");
  }
}
