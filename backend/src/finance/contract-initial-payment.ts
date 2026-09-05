import { PaymentConditionType, PaymentPurpose, Prisma } from "@prisma/client";

export const INITIAL_CONTRACT_PAYMENT_PURPOSES = [
  PaymentPurpose.CONTRACT_RESERVATION,
  PaymentPurpose.CONTRACT_PAYMENT,
] as const;

export type InitialContractPayment = {
  amount: Prisma.Decimal;
  purpose: PaymentPurpose;
};

export function resolveInitialContractPayment(input: {
  paymentConditionType: PaymentConditionType | null;
  commercialTotal: Prisma.Decimal | null;
  reservationAmount: unknown;
}): InitialContractPayment {
  if (
    !(input.commercialTotal instanceof Prisma.Decimal) ||
    !input.commercialTotal.isFinite() ||
    input.commercialTotal.lessThanOrEqualTo(0) ||
    input.commercialTotal.decimalPlaces() > 5
  ) {
    throw new Error("CONTRACT_COMMERCIAL_TOTAL_INVALID");
  }
  const reservationAmount = contractReservationAmount(input.reservationAmount);

  if (input.paymentConditionType === PaymentConditionType.CASH) {
    if (reservationAmount.greaterThan(0)) {
      throw new Error("CONTRACT_CASH_RESERVATION_NOT_ALLOWED");
    }
    return { amount: input.commercialTotal, purpose: PaymentPurpose.CONTRACT_PAYMENT };
  }

  if (input.paymentConditionType === PaymentConditionType.CREDIT) {
    if (reservationAmount.lessThanOrEqualTo(0)) {
      throw new Error("CONTRACT_CREDIT_RESERVATION_REQUIRED");
    }
    if (reservationAmount.greaterThanOrEqualTo(input.commercialTotal)) {
      throw new Error("CONTRACT_CREDIT_RESERVATION_MUST_BE_LESS_THAN_TOTAL");
    }
    return { amount: reservationAmount, purpose: PaymentPurpose.CONTRACT_RESERVATION };
  }

  throw new Error("CONTRACT_PAYMENT_CONDITION_INVALID");
}

function contractReservationAmount(value: unknown): Prisma.Decimal {
  if (value === undefined || value === null || value === "") return new Prisma.Decimal(0);
  try {
    const amount = new Prisma.Decimal(value as Prisma.Decimal.Value);
    if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 5) {
      throw new Error("invalid");
    }
    return amount;
  } catch {
    throw new Error("CONTRACT_RESERVATION_AMOUNT_INVALID");
  }
}
