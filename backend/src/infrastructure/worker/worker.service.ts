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
  ): Worker | null {
    if (!registrationKey.trim()) {
      throw new Error("Worker registration key must not be empty.");
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
      worker = new Worker(queueName, processor, {
        connection,
        prefix: this.queueService.getPrefix(),
        concurrency: this.config.concurrency,
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
    worker.on("completed", (job: Job) => {
      this.logger.log(
        `BullMQ worker ${registrationKey} completed job ${job.id ?? "unknown"}.`,
      );
    });
    worker.on("failed", (job: Job | undefined, error: Error) => {
      this.logger.error(
        `BullMQ worker ${registrationKey} failed job ${job?.id ?? "unknown"}: ${error.message}`,
      );
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

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown BullMQ worker error";
  }
}
