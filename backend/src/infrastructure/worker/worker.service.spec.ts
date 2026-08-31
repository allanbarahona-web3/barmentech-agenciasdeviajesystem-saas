import { HttpException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { Processor, UnrecoverableError, Worker } from "bullmq";
import type { QueueService } from "../queue";
import { PLATFORM_QUEUE_KEYS } from "../queue";
import type { RedisService } from "../redis";
import {
  MAX_WORKER_REGISTRATION_CONCURRENCY,
  WorkerService,
} from "./worker.service";

jest.mock("bullmq", () => {
  class MockUnrecoverableError extends Error {}
  return {
    UnrecoverableError: MockUnrecoverableError,
    Worker: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      waitUntilReady: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

const SUBMISSION = "billing-document-electronic-issuance-requested";
const STATUS = "billing-document-electronic-status-reconciliation";
const REFRESH = "billing-document-electronic-refresh-reconciliation";

describe("WorkerService production queue ownership", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stores definitions without Redis resources and creates three isolated fiscal workers at bootstrap", async () => {
    const context = setup(true, "7");
    const submission = jest.fn().mockResolvedValue("submission");
    const status = jest.fn().mockResolvedValue("status");
    const refresh = jest.fn().mockResolvedValue("refresh");
    registerFiscal(context.service, submission, status, refresh);

    expect(Worker).not.toHaveBeenCalled();
    expect(context.duplicate).not.toHaveBeenCalled();
    expect(context.service.getRegisteredWorkers()).toHaveLength(0);

    await context.service.onApplicationBootstrap();

    expect(Worker).toHaveBeenCalledTimes(3);
    expect(context.duplicate).toHaveBeenCalledTimes(3);
    expect(context.service.getRegisteredWorkers()).toHaveLength(3);
    expectWorker(0, "fiscal-billing", 5);
    expectWorker(1, "fiscal-status-reconciliation", 10);
    expectWorker(2, "fiscal-refresh-reconciliation", 3);

    await expect(processor(0)(job(SUBMISSION))).resolves.toBe("submission");
    await expect(processor(1)(job(STATUS))).resolves.toBe("status");
    await expect(processor(2)(job(REFRESH))).resolves.toBe("refresh");
    expect(submission).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("makes cross-routing and unknown names unrecoverable on every fiscal queue", async () => {
    const context = setup(true, "1");
    const handlers = [jest.fn(), jest.fn(), jest.fn()];
    registerFiscal(context.service, handlers[0], handlers[1], handlers[2]);
    await context.service.onApplicationBootstrap();

    for (const [index, wrongName] of [[0, STATUS], [1, REFRESH], [2, SUBMISSION]] as const) {
      let observed: unknown;
      await processor(index)(job(wrongName)).catch((error) => { observed = error; });
      expect(observed).toBeInstanceOf(UnrecoverableError);
      expect(observed).toEqual(expect.objectContaining({ message: "BULLMQ_WORKER_JOB_NAME_UNREGISTERED" }));
    }
    handlers.forEach((handler) => expect(handler).not.toHaveBeenCalled());
  });

  it("rejects a second physical queue owner before Redis or Worker creation even when disabled", () => {
    const context = setup(false, "1");
    context.service.registerWorker("first", PLATFORM_QUEUE_KEYS.BILLING, jest.fn(), {
      jobNames: "first-job",
    });
    expect(() => context.service.registerWorker("second", PLATFORM_QUEUE_KEYS.BILLING, jest.fn(), {
      jobNames: "second-job",
    })).toThrow("Physical queue billing is already owned by worker registration first.");
    expect(Worker).not.toHaveBeenCalled();
    expect(context.duplicate).not.toHaveBeenCalled();
  });

  it("rejects duplicate keys and unsafe accepted-name arrays while disabled", () => {
    const context = setup(false, "1");
    context.service.registerWorker("owner", PLATFORM_QUEUE_KEYS.DOCUMENT, jest.fn(), {
      jobNames: "safe-job",
    });
    expect(() => context.service.registerWorker("owner", PLATFORM_QUEUE_KEYS.EMAIL, jest.fn(), {
      jobNames: "other-job",
    })).toThrow("Worker registration key already exists: owner.");

    const invalidValues: unknown[] = [
      [], [""], [" padded"], ["padded "], ["unsafe.name"], ["x".repeat(101)], [1], [Symbol("job")],
    ];
    invalidValues.forEach((jobNames, index) => {
      expect(() => context.service.registerWorker(
        `invalid-${index}`,
        PLATFORM_QUEUE_KEYS[`PDF`],
        jest.fn(),
        { jobNames: jobNames as never },
      )).toThrow();
    });
    expect(() => context.service.registerWorker("duplicate-array", PLATFORM_QUEUE_KEYS.PDF, jest.fn(), {
      jobNames: ["same-job", "same-job"],
    })).toThrow("Worker registration job names must be unique.");
    expect(Worker).not.toHaveBeenCalled();
    expect(context.duplicate).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, 26, Number.NaN])(
    "rejects invalid concurrency %s before storing or creating resources",
    (concurrency) => {
      const context = setup(false, "1");
      expect(() => context.service.registerWorker("invalid", PLATFORM_QUEUE_KEYS.BILLING, jest.fn(), {
        concurrency,
        jobNames: "valid-job",
      })).toThrow(
        `Worker concurrency must be an integer between 1 and ${MAX_WORKER_REGISTRATION_CONCURRENCY}.`,
      );
      expect(Worker).not.toHaveBeenCalled();
      expect(context.duplicate).not.toHaveBeenCalled();
    },
  );

  it("supports intentional multi-name handlers for unrelated queues", async () => {
    const context = setup(true, "7");
    const receipt = jest.fn().mockResolvedValue("receipt");
    const email = jest.fn().mockResolvedValue("email");
    context.service.registerWorker("receipt", PLATFORM_QUEUE_KEYS.BILLING, receipt, {
      jobNames: ["billing-process-verified-payment-receipt", "billing-bootstrap-contract"],
    });
    context.service.registerWorker("email", PLATFORM_QUEUE_KEYS.EMAIL, email, {
      jobNames: ["auth-welcome-email", "contract-review-email"],
    });
    await context.service.onApplicationBootstrap();

    expect(Worker).toHaveBeenCalledTimes(2);
    expectWorker(0, "billing", 7);
    expectWorker(1, "email", 7);
    await processor(0)(job("billing-process-verified-payment-receipt"));
    await processor(0)(job("billing-bootstrap-contract"));
    await processor(1)(job("auth-welcome-email"));
    await processor(1)(job("contract-review-email"));
    expect(receipt).toHaveBeenCalledTimes(2);
    expect(email).toHaveBeenCalledTimes(2);
  });

  it("closes every partially created worker and connection when readiness fails", async () => {
    const context = setup(true, "1");
    registerFiscal(context.service, jest.fn(), jest.fn(), jest.fn());
    jest.mocked(Worker).mockImplementationOnce(workerMock as never)
      .mockImplementationOnce(() => ({
        ...workerMock(),
        waitUntilReady: jest.fn().mockRejectedValue(new Error("redis://credential")),
      }) as never)
      .mockImplementationOnce(workerMock as never);

    const bootstrap = context.service.onApplicationBootstrap();
    context.connections.forEach((connection) => {
      connection.quit.mockRejectedValue(new Error("redis://credential"));
    });
    await expect(bootstrap).rejects.toThrow("BULLMQ_WORKER_STARTUP_FAILED");
    expect(Worker).toHaveBeenCalledTimes(3);
    for (const result of jest.mocked(Worker).mock.results) {
      expect((result.value as ReturnType<typeof workerMock>).close).toHaveBeenCalledTimes(1);
    }
    context.connections.forEach((connection) => {
      expect(connection.quit).toHaveBeenCalledTimes(1);
      expect(connection.disconnect).toHaveBeenCalledTimes(1);
    });
    expect(context.service.getRegisteredWorkers()).toHaveLength(0);
  });

  it("shutdown closes each worker and duplicated connection exactly once", async () => {
    const context = setup(true, "1");
    registerFiscal(context.service, jest.fn(), jest.fn(), jest.fn());
    await context.service.onApplicationBootstrap();
    await context.service.onModuleDestroy();
    await context.service.onModuleDestroy();

    for (const result of jest.mocked(Worker).mock.results) {
      expect((result.value as ReturnType<typeof workerMock>).close).toHaveBeenCalledTimes(1);
    }
    context.connections.forEach((connection) => {
      expect(connection.quit).toHaveBeenCalledTimes(1);
      expect(connection.disconnect).not.toHaveBeenCalled();
    });
  });

  it("falls back to disconnect exactly once when graceful quit rejects", async () => {
    const context = setup(true, "1");
    context.service.registerWorker("worker", PLATFORM_QUEUE_KEYS.BILLING, jest.fn(), {
      jobNames: "safe-job",
    });
    await context.service.onApplicationBootstrap();
    context.connections[0].quit.mockRejectedValue(new Error("redis://credential"));

    await expect(context.service.onModuleDestroy()).resolves.toBeUndefined();

    expect(context.connections[0].quit).toHaveBeenCalledTimes(1);
    expect(context.connections[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it.each(["throws", "rejects"] as const)(
    "contains a disconnect that %s during cleanup",
    async behavior => {
      const context = setup(true, "1");
      context.service.registerWorker("worker", PLATFORM_QUEUE_KEYS.BILLING, jest.fn(), {
        jobNames: "safe-job",
      });
      await context.service.onApplicationBootstrap();
      context.connections[0].status = "connecting";
      if (behavior === "throws") {
        context.connections[0].disconnect.mockImplementation(() => {
          throw new Error("redis://credential");
        });
      } else {
        context.connections[0].disconnect.mockReturnValue(
          Promise.reject(new Error("redis://credential")),
        );
      }

      await expect(context.service.onModuleDestroy()).resolves.toBeUndefined();

      expect(context.connections[0].quit).not.toHaveBeenCalled();
      expect(context.connections[0].disconnect).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps shutdown waiting for Worker close and active processing", async () => {
    const context = setup(true, "1");
    let release!: () => void;
    const active = new Promise<void>((resolve) => { release = resolve; });
    context.service.registerWorker("worker", PLATFORM_QUEUE_KEYS.BILLING, () => active, {
      jobNames: "safe-job",
    });
    await context.service.onApplicationBootstrap();
    const processing = processor(0)(job("safe-job"));
    const worker = jest.mocked(Worker).mock.results[0].value as ReturnType<typeof workerMock>;
    worker.close.mockImplementation(async () => { await active; });
    let stopped = false;

    const shutdown = context.service.onModuleDestroy().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);

    release();
    await Promise.all([processing, shutdown]);
    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(context.connections[0].quit).toHaveBeenCalledTimes(1);
    expect(context.connections[0].disconnect).not.toHaveBeenCalled();
  });

  it("retains stable codes and survives hostile exception shapes", async () => {
    const context = setup(true, "1");
    const handler = jest.fn();
    context.service.registerWorker("safe", PLATFORM_QUEUE_KEYS.BILLING, handler, {
      jobNames: "safe-job",
    });
    await context.service.onApplicationBootstrap();
    const route = processor(0);

    handler.mockRejectedValueOnce(new HttpException({
      code: "BILLING_DOCUMENT_SUBMISSION_PREPARATION_FAILED",
      canonicalJson: "secret",
    }, 422));
    await expect(route(job("safe-job"))).rejects.toThrow("BILLING_DOCUMENT_SUBMISSION_PREPARATION_FAILED");

    handler.mockRejectedValueOnce(Object.assign(new Error("https://secret.invalid"), {
      code: "FISCAL_PROVIDER_TEMPORARY",
    }));
    await expect(route(job("safe-job"))).rejects.toThrow("FISCAL_PROVIDER_TEMPORARY");

    handler.mockRejectedValueOnce(new Error("SAFE_DOMAIN_CODE"));
    await expect(route(job("safe-job"))).rejects.toThrow("SAFE_DOMAIN_CODE");

    const hostileGetter = Object.defineProperty({}, "code", {
      get: () => { throw new Error("getter secret"); },
    });
    const hostileProxy = new Proxy({}, {
      getOwnPropertyDescriptor: () => { throw new Error("proxy secret"); },
    });
    class HostileHttpException extends HttpException {
      override getResponse(): string | object { throw new Error("override secret"); }
    }
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const hostileValues: unknown[] = [
      hostileGetter,
      hostileProxy,
      new HostileHttpException({ code: "SAFE_OVERRIDDEN_RESPONSE" }, 500),
      Symbol("secret"),
      () => "secret",
      [],
      cyclic,
      "provider secret",
      null,
      undefined,
    ];
    for (const value of hostileValues) {
      handler.mockRejectedValueOnce(value);
      const expected = value instanceof HostileHttpException
        ? "SAFE_OVERRIDDEN_RESPONSE"
        : "BULLMQ_WORKER_ERROR";
      await expect(route(job("safe-job"))).rejects.toThrow(expected);
    }
  });
});

function registerFiscal(
  service: WorkerService,
  submission: Processor,
  status: Processor,
  refresh: Processor,
): void {
  service.registerWorker("submission", PLATFORM_QUEUE_KEYS.FISCAL_BILLING, submission, {
    concurrency: 5,
    jobNames: SUBMISSION,
  });
  service.registerWorker("status", PLATFORM_QUEUE_KEYS.FISCAL_STATUS_RECONCILIATION, status, {
    concurrency: 10,
    jobNames: STATUS,
  });
  service.registerWorker("refresh", PLATFORM_QUEUE_KEYS.FISCAL_REFRESH_RECONCILIATION, refresh, {
    concurrency: 3,
    jobNames: REFRESH,
  });
}

function workerMock() {
  return {
    on: jest.fn(),
    waitUntilReady: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function expectWorker(index: number, queueName: string, concurrency: number): void {
  expect(Worker).toHaveBeenNthCalledWith(
    index + 1,
    queueName,
    expect.any(Function),
    expect.objectContaining({ concurrency, autorun: false }),
  );
}

function processor(index: number): Processor {
  return jest.mocked(Worker).mock.calls[index][1] as Processor;
}

function job(name: string) {
  return {
    name,
    id: `${name}-id`,
    data: { payload: {}, metadata: { tenantId: "tenant-a" } },
    opts: { attempts: 3 },
    attemptsMade: 0,
  } as never;
}

function setup(enabled: boolean, sharedConcurrency: string) {
  const connections: Array<{
    status: string;
    quit: jest.Mock;
    disconnect: jest.Mock;
  }> = [];
  const duplicate = jest.fn(() => {
    const connection = {
      status: "ready",
      quit: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };
    connections.push(connection);
    return connection;
  });
  const redis = {
    isEnabled: jest.fn().mockReturnValue(enabled),
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
    duplicate,
    connections,
  };
}
