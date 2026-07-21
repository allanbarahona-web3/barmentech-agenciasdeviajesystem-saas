import { GenericDispatchOptions } from "../../infrastructure/job-dispatcher";

export const BILLING_FINANCIAL_EMAIL_JOB_NAMES = {
  AUTOMATIC_RESERVATION_RECEIPT: "billing-automatic-reservation-receipt-email",
  AUTOMATIC_PAYMENT_RECEIPT: "billing-automatic-payment-receipt-email",
  MANUAL_RESERVATION_RECEIPT: "billing-manual-reservation-receipt-email",
  MANUAL_PAYMENT_RECEIPT: "billing-manual-payment-receipt-email",
  MANUAL_CREDIT_NOTE: "billing-manual-credit-note-email",
  AUTOMATIC_INITIAL_INVOICE: "billing-automatic-initial-invoice-email",
  MANUAL_STATEMENT: "billing-manual-statement-email",
} as const;

export type BillingFinancialEmailJobName =
  (typeof BILLING_FINANCIAL_EMAIL_JOB_NAMES)[keyof typeof BILLING_FINANCIAL_EMAIL_JOB_NAMES];

export const BILLING_FINANCIAL_EMAIL_JOB_OPTIONS: Readonly<GenericDispatchOptions> = {
  attempts: 4,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
  timeout: 60000,
};
