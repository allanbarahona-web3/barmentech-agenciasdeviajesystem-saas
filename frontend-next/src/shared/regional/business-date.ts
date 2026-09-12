const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

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

export const formatBusinessDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";

  const parts = new Intl.DateTimeFormat('es-CR', {
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

export const formatBusinessTimestampDate = (dateString: string): string => {
  const dateTime = formatBusinessDateTime(dateString);
  return dateTime === "-" ? "-" : dateTime.split(' ')[0];
};
