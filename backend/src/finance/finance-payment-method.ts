export const FINANCIAL_PAYMENT_METHOD_REGISTRY = [
  "CASH", "BANK_TRANSFER", "CARD", "CHECK", "MOBILE_TRANSFER", "OTHER",
] as const;

export type FinancialPaymentMethod =
  (typeof FINANCIAL_PAYMENT_METHOD_REGISTRY)[number];

const FINANCIAL_PAYMENT_METHODS = new Set<string>(
  FINANCIAL_PAYMENT_METHOD_REGISTRY,
);

/** Returns the canonical Finance token, or null when the value is unsupported. */
export function normalizeFinancialPaymentMethod(
  value: unknown,
): FinancialPaymentMethod | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized.length > 50 || !FINANCIAL_PAYMENT_METHODS.has(normalized)) {
    return null;
  }
  return normalized as FinancialPaymentMethod;
}
