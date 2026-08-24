import { fiscalBillingError } from "./fiscal-billing.errors";

export interface FiscalStatusReconciliationSchedule {
  readonly nextStatusCheckAt: Date | null;
  readonly reconciliationRequired: boolean;
}

const INITIAL_DELAY_MS = 10_000;
const POLLING_WINDOW_MS = 30 * 60_000;

export function initialFiscalStatusReconciliationSchedule(submittedAt: Date): FiscalStatusReconciliationSchedule {
  return schedule(submittedAt, submittedAt, INITIAL_DELAY_MS);
}

export function nextFiscalStatusReconciliationSchedule(
  submittedAt: Date,
  completedStatusCheckCount: number,
  completedAt: Date,
): FiscalStatusReconciliationSchedule {
  if (!Number.isInteger(completedStatusCheckCount) || completedStatusCheckCount < 1) invalid();
  const delay = completedStatusCheckCount === 1 ? 20_000
    : completedStatusCheckCount === 2 ? 40_000
      : completedStatusCheckCount === 3 ? 60_000 : 5 * 60_000;
  return schedule(submittedAt, completedAt, delay);
}

function schedule(submittedAt: Date, referenceAt: Date, delay: number): FiscalStatusReconciliationSchedule {
  if (!validDate(submittedAt) || !validDate(referenceAt)) invalid();
  const deadline = submittedAt.getTime() + POLLING_WINDOW_MS;
  const reference = referenceAt.getTime();
  const candidate = reference + delay;
  if (!Number.isFinite(deadline) || !Number.isFinite(candidate) || reference >= deadline || candidate >= deadline) {
    return { nextStatusCheckAt: null, reconciliationRequired: true };
  }
  return { nextStatusCheckAt: new Date(candidate), reconciliationRequired: false };
}

function validDate(value: unknown): value is Date { return value instanceof Date && Number.isFinite(value.getTime()); }
function invalid(): never { throw fiscalBillingError("BILLING_DOCUMENT_STATUS_STATE_CORRUPT"); }
