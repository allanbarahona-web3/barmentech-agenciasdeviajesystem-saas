import type { Job } from "bullmq";
import type { JobEnvelope } from "../infrastructure/job-dispatcher";
import type { WorkerService } from "../infrastructure/worker";
import { PLATFORM_QUEUE_KEYS } from "../infrastructure/queue";
import type { AirfarePricingRepriceProcessorService } from "./airfare-pricing-reprice-processor.service";
import { AIRFARE_PRICING_CONCURRENCY, AIRFARE_PRICING_JOB_NAME, AIRFARE_PRICING_WORKER_KEY, airfarePricingJobId } from "./airfare-pricing-job.constants";
import { AirfarePricingRepriceWorker } from "./airfare-pricing-reprice.worker";

describe("AirfarePricingRepriceWorker", () => {
  it("registers the AIRFARE queue worker and delegates one persisted request", async () => {
    let handler: ((job: Job<JobEnvelope<unknown>>) => Promise<unknown>) | undefined;
    const registerWorker = jest.fn((_key, _queue, callback) => { handler = callback; });
    const process = jest.fn().mockResolvedValue({ status: "COMPLETED", outcome: "PUBLISHED" });
    const worker = new AirfarePricingRepriceWorker({ registerWorker } as unknown as WorkerService, { process } as unknown as AirfarePricingRepriceProcessorService);

    worker.onModuleInit();

    expect(registerWorker).toHaveBeenCalledWith(AIRFARE_PRICING_WORKER_KEY, PLATFORM_QUEUE_KEYS.AIRFARE_PRICING, expect.any(Function), { concurrency: AIRFARE_PRICING_CONCURRENCY, jobNames: AIRFARE_PRICING_JOB_NAME });
    await expect(handler!(job("request-a"))).resolves.toEqual({ status: "COMPLETED", outcome: "PUBLISHED" });
    expect(process).toHaveBeenCalledWith("tenant-a", "request-a");
  });

  it("rejects malformed delivery before invoking the processor", async () => {
    let handler: ((job: Job<JobEnvelope<unknown>>) => Promise<unknown>) | undefined;
    const process = jest.fn();
    const worker = new AirfarePricingRepriceWorker({ registerWorker: jest.fn((_key, _queue, callback) => { handler = callback; }) } as unknown as WorkerService, { process } as unknown as AirfarePricingRepriceProcessorService);
    worker.onModuleInit();

    await expect(handler!({ ...job("request-a"), data: { payload: { tenantId: "tenant-a", requestId: "request-a", eventVersion: 2 } } } as never)).rejects.toThrow("AIRFARE_PRICING_JOB_INVALID");
    expect(process).not.toHaveBeenCalled();
  });
});

function job(requestId: string) {
  return { id: airfarePricingJobId(requestId), name: AIRFARE_PRICING_JOB_NAME, data: { payload: { tenantId: "tenant-a", requestId, eventVersion: 1 }, metadata: { tenantId: "tenant-a" } } } as unknown as Job<JobEnvelope<unknown>>;
}
