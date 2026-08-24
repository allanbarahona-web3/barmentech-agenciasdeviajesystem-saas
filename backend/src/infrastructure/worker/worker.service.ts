import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, Processor, Worker } from "bullmq";
import { Redis } from "ioredis";
import {
  PLATFORM_QUEUE_KEYS,
  PlatformQueueKey,
  QueueService,
} from "../queue";
import { RedisService } from "../redis";
import { getWorkerConfig, WorkerRuntimeConfig } from "./worker.config";
import { DUMMY_WORKER_REGISTRATION_KEY } from "./worker.constants";

interface RegisteredWorker {
  worker: Worker;
  connection: Redis;
}

interface DispatcherJobData {
  metadata?: {
    correlationId?: unknown;
    tenantId?: unknown;
    requestId?: unknown;
  };
  runtime?: {
    timeout?: unknown;
  };
}

export interface WorkerRegistrationOptions {
  concurrency?: number;
}

export const MAX_WORKER_REGISTRATION_CONCURRENCY = 25;

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private readonly config: WorkerRuntimeConfig;
  private readonly workers = new Map<string, RegisteredWorker>();

  constructor(
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
    configService: ConfigService,
  ) {
    this.config = getWorkerConfig(configService);
  }

  onModuleInit(): void {
    if (!this.config.dummyWorkerEnabled) {
      this.logger.log("Worker runtime initialized; dummy worker is disabled.");
      return;
    }

    if (!this.redisService.isEnabled()) {
      this.logger.warn(
        "Worker runtime validation is disabled because Redis is not configured.",
      );
      return;
    }

    void this.initializeDummyWorker().catch((error: unknown) => {
      this.logger.error(
        `Worker runtime validation failed without blocking startup: ${this.getErrorMessage(error)}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    const registrations = [...this.workers.entries()];
    this.workers.clear();

    const results = await Promise.allSettled(
      registrations.map(async ([registrationKey, registration]) => {
        try {
          await registration.worker.close();
        } finally {
          await this.closeConnection(registration.connection);
        }
        this.logger.log(`BullMQ worker stopped: ${registrationKey}.`);
      }),
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        this.logger.error(
          `Failed to stop BullMQ worker ${registrations[index][0]}: ${this.getErrorMessage(result.reason)}`,
        );
      }
    });
  }

  registerWorker(
    registrationKey: string,
    queueKey: PlatformQueueKey,
    processor: Processor,
    options?: WorkerRegistrationOptions,
  ): Worker | null {
    if (!registrationKey.trim()) {
      throw new Error("Worker registration key must not be empty.");
    }

    const concurrency = options?.concurrency;
    if (
      concurrency !== undefined &&
      (!Number.isInteger(concurrency) ||
        concurrency < 1 ||
        concurrency > MAX_WORKER_REGISTRATION_CONCURRENCY)
    ) {
      throw new Error(
        `Worker concurrency must be an integer between 1 and ${MAX_WORKER_REGISTRATION_CONCURRENCY}.`,
      );
    }

    if (!this.redisService.isEnabled()) {
      this.logger.warn(
        `BullMQ worker ${registrationKey} was not registered because Redis is disabled.`,
      );
      return null;
    }

    const existingRegistration = this.workers.get(registrationKey);
    if (existingRegistration) {
      return existingRegistration.worker;
    }

    const queueName = this.queueService.getConfiguredQueueName(queueKey);
    const connection = this.redisService.getClient().duplicate({
      connectionName: `worker:${registrationKey}`,
      maxRetriesPerRequest: null,
    });
    let worker: Worker;
    try {
      worker = new Worker(queueName, this.wrapProcessor(processor), {
        connection,
        prefix: this.queueService.getPrefix(),
        concurrency: concurrency ?? this.config.concurrency,
        lockDuration: this.config.lockDurationMs,
        stalledInterval: this.config.stalledIntervalMs,
        maxStalledCount: this.config.maxStalledCount,
        drainDelay: this.config.drainDelaySeconds,
      });
    } catch (error) {
      connection.disconnect();
      throw error;
    }

    worker.on("ready", () => {
      this.logger.log(`BullMQ worker ready: ${registrationKey}.`);
    });
    worker.on("active", (job: Job) => {
      this.logger.log(
        `BullMQ worker ${registrationKey} executing job ${job.id ?? "unknown"}` +
          `${this.formatJobContext(job)} attempt=${job.attemptsMade + 1}/${job.opts.attempts ?? 1}.`,
      );
    });
    worker.on("completed", (job: Job) => {
      this.logger.log(
        `BullMQ worker ${registrationKey} completed job ${job.id ?? "unknown"}` +
          `${this.formatJobContext(job)} attemptsMade=${job.attemptsMade}.`,
      );
    });
    worker.on("failed", (job: Job | undefined, error: Error) => {
      const attempts = job?.opts.attempts ?? 1;
      const willRetry = Boolean(job && job.attemptsMade < attempts);
      this.logger.error(
        `BullMQ worker ${registrationKey} failed job ${job?.id ?? "unknown"}` +
          `${job ? this.formatJobContext(job) : ""} attemptsMade=${job?.attemptsMade ?? 0}` +
          ` willRetry=${willRetry}: ${error.message}`,
      );
      if (willRetry) {
        this.logger.warn(
          `BullMQ worker ${registrationKey} retry scheduled for job ${job?.id ?? "unknown"}` +
            `${job ? this.formatJobContext(job) : ""}.`,
        );
      }
    });
    worker.on("error", (error: Error) => {
      this.logger.error(
        `BullMQ worker ${registrationKey} connection error: ${error.message}`,
      );
    });

    this.workers.set(registrationKey, { worker, connection });
    this.logger.log(
      `BullMQ worker registered: ${registrationKey} on queue ${queueName}.`,
    );
    return worker;
  }

  getWorker(registrationKey: string): Worker | undefined {
    return this.workers.get(registrationKey)?.worker;
  }

  getRegisteredWorkers(): readonly Worker[] {
    return [...this.workers.values()].map(({ worker }) => worker);
  }

  private async initializeDummyWorker(): Promise<void> {
    const queueKey = PLATFORM_QUEUE_KEYS.WORKER_RUNTIME;
    const worker = this.registerWorker(
      DUMMY_WORKER_REGISTRATION_KEY,
      queueKey,
      async (job: Job) => {
        this.logger.log(
          `Dummy BullMQ worker executing test job ${job.id ?? "unknown"}.`,
        );
        return { completed: true };
      },
    );
    const queue = this.queueService.registerQueue(queueKey);

    if (!worker || !queue) {
      return;
    }

    await queue.add(
      this.config.dummyJobName,
      { source: "worker-runtime-validation" },
      {
        jobId: DUMMY_WORKER_REGISTRATION_KEY,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    this.logger.log("Dummy BullMQ validation job submitted.");
  }

  private async closeConnection(connection: Redis): Promise<void> {
    if (connection.status === "ready") {
      await connection.quit();
      return;
    }

    connection.disconnect();
  }

  private wrapProcessor(processor: Processor): Processor {
    return async (job: Job, token?: string, workerSignal?: AbortSignal) => {
      const timeout = this.getJobTimeout(job);
      if (!timeout) {
        return processor(job, token, workerSignal);
      }

      const controller = new AbortController();
      const abortFromWorker = () => controller.abort(workerSignal?.reason);
      if (workerSignal?.aborted) {
        abortFromWorker();
      } else {
        workerSignal?.addEventListener("abort", abortFromWorker, { once: true });
      }

      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(new Error(`Job execution timed out after ${timeout}ms.`));
          reject(new Error(`Job execution timed out after ${timeout}ms.`));
        }, timeout);
      });

      try {
        return await Promise.race([
          processor(job, token, controller.signal),
          timeoutPromise,
        ]);
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
        workerSignal?.removeEventListener("abort", abortFromWorker);
      }
    };
  }

  private getJobTimeout(job: Job): number | undefined {
    const timeout = (job.data as DispatcherJobData | undefined)?.runtime?.timeout;
    return typeof timeout === "number" && Number.isInteger(timeout) && timeout > 0
      ? timeout
      : undefined;
  }

  private formatJobContext(job: Job): string {
    const metadata = (job.data as DispatcherJobData | undefined)?.metadata;
    if (!metadata) {
      return "";
    }

    return ["correlationId", "tenantId", "requestId"]
      .map((key) => {
        const value = metadata[key as keyof typeof metadata];
        return value === undefined || value === null ? "" : ` ${key}=${String(value)}`;
      })
      .join("");
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown BullMQ worker error";
  }
}
