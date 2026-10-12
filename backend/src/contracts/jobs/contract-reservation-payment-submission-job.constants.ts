import { GenericDispatchOptions } from "../../infrastructure/job-dispatcher";

export const CONTRACT_RESERVATION_PAYMENT_SUBMISSION_JOB_NAME =
  "contract-reservation-payment-submit";

export const CONTRACT_RESERVATION_PAYMENT_SUBMISSION_WORKER_REGISTRATION_KEY =
  "contract-reservation-payment-submission-worker";

export const CONTRACT_RESERVATION_PAYMENT_SUBMISSION_JOB_OPTIONS: Readonly<GenericDispatchOptions> =
  {
    attempts: 4,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    timeout: 120000,
  };

export function getContractReservationPaymentSubmissionJobId(
  contractId: string,
): string {
  return `contract-reservation-payment-submit-${contractId}`;
}
