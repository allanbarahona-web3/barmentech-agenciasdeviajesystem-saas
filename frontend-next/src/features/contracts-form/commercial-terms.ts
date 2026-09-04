import type { PaymentConditionType } from "./types";

type ArchivePaymentTermsResult =
  | {
      ok: true;
      paymentConditionType: PaymentConditionType;
      paymentDueDate: string | null;
    }
  | {
      ok: false;
      message: string;
    };

const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export const resolveArchivePaymentTerms = (
  paymentConditionType: PaymentConditionType | null,
  paymentDueDate: string,
): ArchivePaymentTermsResult => {
  if (paymentConditionType !== "CASH" && paymentConditionType !== "CREDIT") {
    return {
      ok: false,
      message: "Seleccione una condición de pago: contado o crédito.",
    };
  }

  if (paymentConditionType === "CASH") {
    return {
      ok: true,
      paymentConditionType,
      paymentDueDate: null,
    };
  }

  const normalizedDueDate = String(paymentDueDate || "").trim();
  if (!isValidIsoDate(normalizedDueDate)) {
    return {
      ok: false,
      message: "Para crédito, indique una fecha límite de pago válida.",
    };
  }

  return {
    ok: true,
    paymentConditionType,
    paymentDueDate: normalizedDueDate,
  };
};
