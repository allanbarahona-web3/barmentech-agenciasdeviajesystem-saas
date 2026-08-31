import { UnrecoverableError } from "bullmq";
import type { FiscalInvoiceAutoDeliveryService } from "../fiscal-invoice-auto-delivery.service";
import { FiscalInvoiceAutoDeliveryError } from "../fiscal-invoice-auto-delivery.service";
import { FISCAL_INVOICE_AUTO_DELIVERY_JOB_NAME } from "./fiscal-invoice-auto-delivery.constants";
import { FiscalInvoiceAutoDeliveryProcessor } from "./fiscal-invoice-auto-delivery.processor";

describe("FiscalInvoiceAutoDeliveryProcessor", () => {
  it("invokes only the delivery service with tenant/event/lease identity", async () => {
    const c = context(); c.processor.onModuleInit();
    await c.handler!(job());
    expect(c.process).toHaveBeenCalledWith({ tenantId: "tenant-a", billingOutboxEventId: "child-a", lockOwner: "owner-a" });
  });
  it("permanently fails structural/business errors without BullMQ retry", async () => {
    const c = context(new FiscalInvoiceAutoDeliveryError("FISCAL_INVOICE_AUTO_DELIVERY_RECIPIENT_INVALID", false)); c.processor.onModuleInit();
    await expect(c.handler!(job())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(c.fail).toHaveBeenCalledWith(expect.anything(), "FISCAL_INVOICE_AUTO_DELIVERY_RECIPIENT_INVALID");
  });
  it("releases retryable final attempts to the bounded outbox lifecycle", async () => {
    const c = context(new FiscalInvoiceAutoDeliveryError("FISCAL_INVOICE_AUTO_DELIVERY_ARTIFACT_NOT_READY", true)); c.processor.onModuleInit();
    await expect(c.handler!(job({ attemptsMade: 2 }))).rejects.toBeInstanceOf(FiscalInvoiceAutoDeliveryError);
    expect(c.release).toHaveBeenCalledTimes(1); expect(c.fail).not.toHaveBeenCalled();
  });
});

function context(error?: Error) {
  let handler: ((job: any) => Promise<unknown>) | undefined;
  const workers = { registerWorker: jest.fn((_key, _queue, value) => { handler = value; }) };
  const process = error ? jest.fn().mockRejectedValue(error) : jest.fn().mockResolvedValue(undefined);
  const fail = jest.fn().mockResolvedValue(undefined); const release = jest.fn().mockResolvedValue(undefined);
  const processor = new FiscalInvoiceAutoDeliveryProcessor(workers as any, { processClaimedDelivery: process, failClaim: fail, releaseClaimAfterWorkerFailure: release } as unknown as FiscalInvoiceAutoDeliveryService);
  return { processor, get handler() { return handler; }, process, fail, release };
}
function job(overrides: Record<string, unknown> = {}) { return { name: FISCAL_INVOICE_AUTO_DELIVERY_JOB_NAME, data: { payload: { tenantId: "tenant-a", outboxEventId: "child-a", lockOwner: "owner-a", eventVersion: 1 } }, attemptsMade: 0, opts: { attempts: 3 }, ...overrides }; }
