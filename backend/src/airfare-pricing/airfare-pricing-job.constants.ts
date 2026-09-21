export const AIRFARE_PRICING_JOB_NAME = "airfare-pricing-reprice-request";
export const AIRFARE_PRICING_WORKER_KEY = "airfare-pricing-reprice";
export const AIRFARE_PRICING_CONCURRENCY = 3;
export type AirfarePricingJobPayload = { tenantId: string; requestId: string; eventVersion: 1 };
export function airfarePricingJobId(requestId: string) { return `airfare-pricing-${requestId}`; }
