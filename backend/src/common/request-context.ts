import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  clientTimeZone?: string;
  clientUtcOffsetMinutes?: number;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = async <T>(
  context: RequestContext,
  callback: () => Promise<T> | T,
): Promise<T> => {
  return requestContextStorage.run(context, callback);
};

export const getRequestContext = (): RequestContext => {
  return requestContextStorage.getStore() || {};
};

const isValidTimeZone = (timeZone: string): boolean => {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const formatWithOffset = (value: Date, offsetMinutes: number, includeTime: boolean): string => {
  const adjusted = new Date(value.getTime() - offsetMinutes * 60 * 1000);
  const dd = String(adjusted.getUTCDate()).padStart(2, "0");
  const mm = String(adjusted.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = adjusted.getUTCFullYear();

  if (!includeTime) {
    return `${dd}/${mm}/${yyyy}`;
  }

  const hh = String(adjusted.getUTCHours()).padStart(2, "0");
  const min = String(adjusted.getUTCMinutes()).padStart(2, "0");
  const ss = String(adjusted.getUTCSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
};

export const formatDateForClient = (
  value: Date | string | null | undefined,
  locale = "es-CR",
): string => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const context = getRequestContext();
  const clientTimeZone = String(context.clientTimeZone || "").trim();
  if (clientTimeZone && isValidTimeZone(clientTimeZone)) {
    return new Intl.DateTimeFormat(locale, {
      timeZone: clientTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  if (typeof context.clientUtcOffsetMinutes === "number" && Number.isFinite(context.clientUtcOffsetMinutes)) {
    return formatWithOffset(date, context.clientUtcOffsetMinutes, false);
  }

  return date.toLocaleDateString(locale);
};

export const formatDateTimeForClient = (
  value: Date | string | null | undefined,
  locale = "es-CR",
): string => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const context = getRequestContext();
  const clientTimeZone = String(context.clientTimeZone || "").trim();
  if (clientTimeZone && isValidTimeZone(clientTimeZone)) {
    const datePart = new Intl.DateTimeFormat(locale, {
      timeZone: clientTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);

    const timePart = new Intl.DateTimeFormat(locale, {
      timeZone: clientTimeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);

    return `${datePart} ${timePart}`;
  }

  if (typeof context.clientUtcOffsetMinutes === "number" && Number.isFinite(context.clientUtcOffsetMinutes)) {
    return formatWithOffset(date, context.clientUtcOffsetMinutes, true);
  }

  return date.toLocaleString(locale);
};
