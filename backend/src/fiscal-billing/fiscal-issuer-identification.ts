import { fiscalBillingAdminError } from "./fiscal-billing-admin.errors";

const CR_FORMATS: Record<string, { pattern: RegExp; expected: string }> = {
  "01": { pattern: /^\d{9}$/, expected: "9 dígitos" },
  "02": { pattern: /^\d{10}$/, expected: "10 dígitos" },
  "03": { pattern: /^\d{11,12}$/, expected: "11 o 12 dígitos" },
  "04": { pattern: /^\d{10}$/, expected: "10 dígitos" },
};

export function normalizeAndValidateIssuerIdentification(
  countryCode: string,
  identificationTypeCode: string,
  identificationNumber: string,
): string {
  const trimmed = identificationNumber.trim();
  if (countryCode !== "CR") return trimmed;
  const canonical = normalizeCrIdentification(
    identificationTypeCode,
    identificationNumber,
  );
  const format = CR_FORMATS[identificationTypeCode];
  if (!canonical) {
    throw fiscalBillingAdminError("FISCAL_ISSUER_IDENTIFICATION_INVALID", {
      identificationTypeCode,
      expectedCanonicalFormat:
        format?.expected ?? "tipo de identificación CR válido (01, 02, 03 o 04)",
      ...(canonical ? { receivedCanonicalLength: canonical.length } : {}),
    });
  }
  return canonical;
}

export function normalizeCrIdentification(
  identificationTypeCode: string,
  identificationNumber: string,
): string | null {
  const trimmed = identificationNumber.trim();
  const canonical = /^[0-9 -]+$/.test(trimmed)
    ? trimmed.replace(/[ -]/g, "")
    : "";
  const format = CR_FORMATS[identificationTypeCode];
  return canonical && format?.pattern.test(canonical) ? canonical : null;
}
