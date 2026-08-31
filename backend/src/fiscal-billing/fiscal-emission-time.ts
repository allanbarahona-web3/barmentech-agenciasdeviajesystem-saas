import { fiscalBillingError } from "./fiscal-billing.errors";

export function costaRicaDate(instant: Date): string {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) {
    throw fiscalBillingError("BILLING_DOCUMENT_FISCAL_EMISSION_CONFLICT");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (!year || !month || !day) {
    throw fiscalBillingError("BILLING_DOCUMENT_FISCAL_EMISSION_CONFLICT");
  }
  return `${year}-${month}-${day}`;
}
