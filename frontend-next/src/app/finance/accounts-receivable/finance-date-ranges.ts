export type FinanceDatePreset = '' | 'TODAY' | 'LAST_7_DAYS' | 'LAST_15_DAYS' | 'LAST_MONTH' | 'PREVIOUS_MONTH' | 'CUSTOM';

type DateRange = { dateFrom: string; dateTo: string };

function tenantCalendarDate(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value;
  const year = value('year'); const month = value('month'); const day = value('day');
  return year && month && day ? `${year}-${month}-${day}` : '';
}

function shiftCalendarDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

function previousMonthRange(date: string): DateRange {
  const [year, month] = date.split('-').map(Number);
  const firstCurrentMonth = new Date(Date.UTC(year, month - 1, 1));
  const lastPreviousMonth = new Date(firstCurrentMonth.getTime() - 24 * 60 * 60 * 1000);
  const firstPreviousMonth = new Date(Date.UTC(lastPreviousMonth.getUTCFullYear(), lastPreviousMonth.getUTCMonth(), 1));
  return { dateFrom: firstPreviousMonth.toISOString().slice(0, 10), dateTo: lastPreviousMonth.toISOString().slice(0, 10) };
}

export function financeQuickDateRanges(timeZone: string): Record<Exclude<FinanceDatePreset, '' | 'CUSTOM'>, DateRange> {
  const today = tenantCalendarDate(timeZone);
  return {
    TODAY: { dateFrom: today, dateTo: today },
    LAST_7_DAYS: { dateFrom: shiftCalendarDate(today, -6), dateTo: today },
    LAST_15_DAYS: { dateFrom: shiftCalendarDate(today, -14), dateTo: today },
    LAST_MONTH: { dateFrom: shiftCalendarDate(today, -29), dateTo: today },
    PREVIOUS_MONTH: previousMonthRange(today),
  };
}
