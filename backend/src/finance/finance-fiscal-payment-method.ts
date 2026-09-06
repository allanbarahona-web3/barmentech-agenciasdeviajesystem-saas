import {
  normalizeFinancialPaymentMethod,
  type FinancialPaymentMethod,
} from "./finance-payment-method";

export type CrFiscalPaymentMethodCode = "01" | "02" | "03" | "04" | "06" | "99";

const CR_PAYMENT_METHOD_BY_FINANCE_METHOD: Readonly<
  Record<FinancialPaymentMethod, CrFiscalPaymentMethodCode>
> = Object.freeze({
  CASH: "01",
  CARD: "02",
  CHECK: "03",
  BANK_TRANSFER: "04",
  MOBILE_TRANSFER: "06",
  OTHER: "99",
});

/** Returns null for an unsupported Finance token; callers must reject it. */
export function mapFinancePaymentMethodToCrFiscalCode(
  value: unknown,
): CrFiscalPaymentMethodCode | null {
  const method = normalizeFinancialPaymentMethod(value);
  return method ? CR_PAYMENT_METHOD_BY_FINANCE_METHOD[method] : null;
}
