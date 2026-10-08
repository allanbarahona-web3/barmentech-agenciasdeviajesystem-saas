export const FISCAL_CREDIT_NOTE_FINANCE_EFFECT_JOB_NAME = "fiscal-credit-note-finance-effect-requested";
export const FISCAL_CREDIT_NOTE_FINANCE_EFFECT_WORKER_REGISTRATION_KEY = "fiscal-credit-note-finance-effect";
export const FISCAL_CREDIT_NOTE_FINANCE_EFFECT_CONCURRENCY = 5;
export const FISCAL_CREDIT_NOTE_FINANCE_EFFECT_POLL_INTERVAL_MS = 1_000;
export const FISCAL_CREDIT_NOTE_FINANCE_EFFECT_BATCH_SIZE = 25;
export const FISCAL_CREDIT_NOTE_FINANCE_EFFECT_LEASE_MS = 60_000;
export type FiscalCreditNoteFinanceEffectJobPayload = { tenantId: string; outboxEventId: string; lockOwner: string; eventVersion: 1 };
export const fiscalCreditNoteFinanceEffectJobId = (eventId: string, attempt: number, owner: string) => `fiscal-credit-note-finance-effect-${eventId}-${attempt}-${owner}`;
