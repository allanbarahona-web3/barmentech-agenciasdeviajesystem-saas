import type { ConfigService } from "@nestjs/config";
import { Worker } from "bullmq";
import type { QueueService } from "../queue";
import { PLATFORM_QUEUE_KEYS } from "../queue";
import type { RedisService } from "../redis";
import {
  MAX_WORKER_REGISTRATION_CONCURRENCY,
  WorkerService,
} from "./worker.service";

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe("WorkerService registration concurrency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes an exact per-registration override to one Worker instance", () => {
    const { service, duplicate } = setup("7");

    service.registerWorker(
      "fiscal-billing-submission",
      PLATFORM_QUEUE_KEYS.FISCAL_BILLING,
      async () => undefined,
      { concurrency: 5 },
    );

    expect(Worker).toHaveBeenCalledTimes(1);
    expect(Worker).toHaveBeenCalledWith(
      "fiscal-billing",
      expect.any(Function),
      expect.objectContaining({ concurrency: 5 }),
    );
    expect(duplicate).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing shared concurrency when an override is omitted", () => {
    const { service } = setup("7");

    service.registerWorker(
      "existing-worker",
      PLATFORM_QUEUE_KEYS.WORKER_RUNTIME,
      async () => undefined,
    );

    expect(Worker).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ concurrency: 7 }),
    );
  });

  it.each([0, -1, 1.5, 26, Number.NaN])(
    "rejects invalid registration concurrency %s before creating Redis or Worker state",
    (concurrency) => {
      const { service, duplicate } = setup("1");

      expect(() =>
        service.registerWorker(
          "invalid-worker",
          PLATFORM_QUEUE_KEYS.FISCAL_BILLING,
          async () => undefined,
          { concurrency },
        ),
      ).toThrow(
        `Worker concurrency must be an integer between 1 and ${MAX_WORKER_REGISTRATION_CONCURRENCY}.`,
      );
      expect(duplicate).not.toHaveBeenCalled();
      expect(Worker).not.toHaveBeenCalled();
    },
  );

  it("retains shared graceful shutdown for workers using an override", async () => {
    const { service, connection } = setup("1");
    service.registerWorker(
      "fiscal-billing-submission",
      PLATFORM_QUEUE_KEYS.FISCAL_BILLING,
      async () => undefined,
      { concurrency: 5 },
    );
    const worker = jest.mocked(Worker).mock.results[0].value as {
      close: jest.Mock;
    };

    await service.onModuleDestroy();

    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(connection.quit).toHaveBeenCalledTimes(1);
  });
});

function setup(sharedConcurrency: string) {
  const connection = {
    status: "ready",
    quit: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  };
  const duplicate = jest.fn().mockReturnValue(connection);
  const redis = {
    isEnabled: jest.fn().mockReturnValue(true),
    getClient: jest.fn().mockReturnValue({ duplicate }),
  } as unknown as RedisService;
  const queues = {
    getConfiguredQueueName: jest.fn((queueKey: string) => queueKey),
    getPrefix: jest.fn().mockReturnValue("platform"),
  } as unknown as QueueService;
  const config = {
    get: jest.fn((key: string, fallback: string) =>
      key === "BULLMQ_WORKER_CONCURRENCY" ? sharedConcurrency : fallback,
    ),
  } as unknown as ConfigService;
  return {
    service: new WorkerService(redis, queues, config),
    connection,
    duplicate,
  };
}
