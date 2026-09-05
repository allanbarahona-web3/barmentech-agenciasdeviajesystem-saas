export const FINANCE_PAYMENT_METHOD_OPTIONS = [
  { token: "CASH", label: "Efectivo" },
  { token: "BANK_TRANSFER", label: "Transferencia bancaria" },
  { token: "CARD", label: "Tarjeta" },
  { token: "CHECK", label: "Cheque" },
  { token: "MOBILE_TRANSFER", label: "SINPE Móvil" },
  { token: "OTHER", label: "Otro" },
] as const;

export type FinancePaymentMethod =
  (typeof FINANCE_PAYMENT_METHOD_OPTIONS)[number]["token"];

export const isFinancePaymentMethod = (
  value: unknown,
): value is FinancePaymentMethod =>
  FINANCE_PAYMENT_METHOD_OPTIONS.some((option) => option.token === value);

export const FINANCE_PAYMENT_METHOD_LABELS: Record<FinancePaymentMethod, string> =
  Object.fromEntries(
    FINANCE_PAYMENT_METHOD_OPTIONS.map((option) => [option.token, option.label]),
  ) as Record<FinancePaymentMethod, string>;
