import { runCostEngineTenantTransaction } from "./cost-engine-transaction";

describe("Cost Engine transaction telemetry", () => {
  afterEach(() => jest.restoreAllMocks());

  it("logs structured P2028 diagnostics and rethrows the original error", async () => {
    const error = Object.assign(new Error("Transaction already closed after timeout."), { code: "P2028" });
    const logger = { warn: jest.fn() };
    const transaction = { $executeRaw: jest.fn().mockRejectedValue(error) };
    const database = { $transaction: jest.fn((work: (tx: typeof transaction) => Promise<unknown>) => work(transaction)) };
    jest.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(145);

    await expect(runCostEngineTenantTransaction(database as never, logger as never, "tenant-a", "cost-engine.list-categories", async () => undefined)).rejects.toBe(error);

    expect(logger.warn).toHaveBeenCalledWith(JSON.stringify({
      event: "cost_engine_interactive_transaction_timeout",
      context: "cost-engine",
      operation: "cost-engine.list-categories",
      tenantId: "tenant-a",
      elapsedMs: 45,
      errorCode: "P2028",
    }));
  });

  it("does not log or reclassify unrelated transaction failures", async () => {
    const error = new Error("storage unavailable");
    const logger = { warn: jest.fn() };
    const transaction = { $executeRaw: jest.fn().mockRejectedValue(error) };
    const database = { $transaction: jest.fn((work: (tx: typeof transaction) => Promise<unknown>) => work(transaction)) };

    await expect(runCostEngineTenantTransaction(database as never, logger as never, "tenant-a", "cost-engine.get-composition", async () => undefined)).rejects.toBe(error);

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
