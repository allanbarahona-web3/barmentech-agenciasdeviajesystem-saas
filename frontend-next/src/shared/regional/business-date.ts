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
