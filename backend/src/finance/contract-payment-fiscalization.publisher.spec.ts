import { ContractPaymentFiscalizationPublisher } from "./contract-payment-fiscalization.publisher";

describe("ContractPaymentFiscalizationPublisher", () => {
  it("dispatches only the claimed event identity and leaves completion to the worker", async () => {
    const event = {
      id: "event-a", tenantId: "tenant-a", eventType: "contract-payment.fiscalization-requested",
      eventVersion: 1, aggregateType: "Payment", aggregateId: "payment-a",
      payload: { tenantId: "tenant-a", paymentId: "payment-a", eventVersion: 1 },
      attemptCount: 1, maximumAttempts: 5, lockedBy: "owner-a",
    };
    const tx = { $queryRaw: jest.fn().mockResolvedValue([event]) };
    const updateMany = jest.fn();
    const prisma = {
      $transaction: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)),
      billingOutboxEvent: { updateMany },
    };
    const dispatch = jest.fn().mockResolvedValue(undefined);
    const publisher = new ContractPaymentFiscalizationPublisher(prisma as never, { dispatch } as never);

    await publisher.publishAvailableEvents();

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      queueKey: "contract-payment-fiscalization",
      jobName: "contract-payment-fiscalization-requested",
      payload: {
        tenantId: "tenant-a", outboxEventId: "event-a", lockOwner: "owner-a", eventVersion: 1,
      },
      metadata: { tenantId: "tenant-a" },
    }));
    expect(updateMany).not.toHaveBeenCalled();
  });
});
