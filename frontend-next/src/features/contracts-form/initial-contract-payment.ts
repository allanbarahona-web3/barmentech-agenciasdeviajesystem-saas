import {
  isFinancePaymentMethod,
  type FinancePaymentMethod,
} from "../../lib/finance-payment-methods";
import type { PaymentConditionType } from "./types";

type ArchiveInitialPaymentResult =
  | { ok: true; paymentMethod: FinancePaymentMethod; reservationAmount: string }
  | { ok: false; message: string };

export function resolveArchiveInitialPayment(input: {
  paymentConditionType: PaymentConditionType;
  paymentMethod: unknown;
  totalAmount: string;
  reservationAmount: string;
}): ArchiveInitialPaymentResult {
  if (!isFinancePaymentMethod(input.paymentMethod)) {
    return { ok: false, message: "Seleccione un método de pago." };
  }

  if (input.paymentConditionType === "CASH") {
    return { ok: true, paymentMethod: input.paymentMethod, reservationAmount: "0" };
  }

  const reservation = numericAmount(input.reservationAmount);
  if (!Number.isFinite(reservation) || reservation <= 0) {
    return { ok: false, message: "Para crédito, indique un monto de reserva mayor que cero." };
  }

  const total = numericAmount(input.totalAmount);
  if (Number.isFinite(total) && reservation >= total) {
    return { ok: false, message: "La reserva debe ser menor que el monto total del contrato." };
  }

  return { ok: true, paymentMethod: input.paymentMethod, reservationAmount: input.reservationAmount };
}

function numericAmount(value: string): number {
  const normalized = String(value || "").trim();
  if (!normalized) return Number.NaN;
  return Number(normalized);
}
