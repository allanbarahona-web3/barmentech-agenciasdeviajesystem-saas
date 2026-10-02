const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

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
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return "";
  }

  return `${year}-${month}-${day}`;
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

export const formatBusinessTimestampDate = (dateString: string): string => {
  const dateTime = formatBusinessDateTime(dateString);
  return dateTime === "-" ? "-" : dateTime.split(' ')[0];
};
