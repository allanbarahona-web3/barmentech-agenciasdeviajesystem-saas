import {
  HttpException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, Processor, UnrecoverableError, Worker } from "bullmq";
import { Redis } from "ioredis";
import {
  PLATFORM_QUEUE_KEYS,
  PlatformQueueKey,
  QueueService,
} from "../queue";
import { RedisService } from "../redis";
import { getWorkerConfig, WorkerRuntimeConfig } from "./worker.config";
import { DUMMY_WORKER_REGISTRATION_KEY } from "./worker.constants";

interface LogicalWorkerRegistration {
  registrationKey: string;
  queueName: string;
  processor: Processor;
  jobNames: ReadonlySet<string>;
  concurrency: number;
}

interface RunningWorker {
  registration: LogicalWorkerRegistration;
  worker: Worker;
  connection: Redis;
}

interface DispatcherJobData {
  metadata?: {
    correlationId?: unknown;
    tenantId?: unknown;
    requestId?: unknown;
  };
  runtime?: { timeout?: unknown };
}

export interface WorkerRegistrationOptions {
  concurrency?: number;
  jobNames?: string | readonly string[];
}

export const MAX_WORKER_REGISTRATION_CONCURRENCY = 25;
const MAX_WORKER_IDENTITY_LENGTH = 100;
const SAFE_WORKER_IDENTITY = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

@Injectable()
export class WorkerService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(WorkerService.name);
  private readonly config: WorkerRuntimeConfig;
  private readonly registrations = new Map<string, LogicalWorkerRegistration>();
  private readonly queueOwners = new Map<string, string>();
  private readonly workers = new Map<string, RunningWorker>();
  private bootstrapStarted = false;

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

    this.registerWorker(
      DUMMY_WORKER_REGISTRATION_KEY,
      PLATFORM_QUEUE_KEYS.WORKER_RUNTIME,
      async (job: Job) => {
        this.logger.log(
          `Dummy BullMQ worker executing test job ${job.id ?? "unknown"}.`,
        );
        return { completed: true };
      },
      { jobNames: this.config.dummyJobName },
    );

    if (!this.redisService.isEnabled()) {
      this.logger.warn(
        "Worker runtime validation is disabled because Redis is not configured.",
      );
      return;
    }

    void this.submitDummyJob().catch(() => {
      this.logger.error(
        "Worker runtime validation job submission failed without blocking startup: BULLMQ_WORKER_ERROR",
      );
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.bootstrapStarted) {
      throw new Error("BULLMQ_WORKER_BOOTSTRAP_ALREADY_STARTED");
    }
    this.bootstrapStarted = true;

    if (!this.redisService.isEnabled()) {
      this.logger.log("BullMQ workers were not started because Redis is disabled.");
      return;
    }

    const created: RunningWorker[] = [];
    try {
      for (const registration of this.registrations.values()) {
        const running = this.createWorker(registration);
        created.push(running);
      }

      await Promise.all(created.map(({ worker }) => worker.waitUntilReady()));

      for (const running of created) {
        const runPromise = running.worker.run();
        void runPromise.catch((error: unknown) => {
          this.logger.error(
            `BullMQ worker ${running.registration.registrationKey} stopped unexpectedly: ${this.getErrorCode(error)}`,
          );
        });
        this.workers.set(running.registration.queueName, running);
      }
    } catch {
      await this.closeRunningWorkers(created);
      this.workers.clear();
      throw new Error("BULLMQ_WORKER_STARTUP_FAILED");
    }
  }

  async onModuleDestroy(): Promise<void> {
    const running = [...this.workers.values()];
    this.workers.clear();
    await this.closeRunningWorkers(running);
  }

  registerWorker(
    registrationKey: string,
    queueKey: PlatformQueueKey,
    processor: Processor,
    options?: WorkerRegistrationOptions,
  ): void {
    this.assertSafeIdentity(registrationKey, "Worker registration key");
    if (this.bootstrapStarted) {
      throw new Error("Worker registrations are closed after bootstrap starts.");
    }
    if (this.registrations.has(registrationKey)) {
      throw new Error(`Worker registration key already exists: ${registrationKey}.`);
    }
    if (
      typeof queueKey !== "string" ||
      !Object.values(PLATFORM_QUEUE_KEYS).includes(queueKey as PlatformQueueKey)
    ) {
      throw new Error("Worker queue key must be an existing platform queue key.");
    }
    if (typeof processor !== "function") {
      throw new Error("Worker processor must be a function.");
    }

    const queueName = this.queueService.getConfiguredQueueName(queueKey);
    if (
      typeof queueName !== "string" ||
      !queueName ||
      queueName !== queueName.trim()
    ) {
      throw new Error("Worker physical queue name must be a non-empty trimmed string.");
    }
    const existingOwner = this.queueOwners.get(queueName);
    if (existingOwner) {
      throw new Error(
        `Physical queue ${queueName} is already owned by worker registration ${existingOwner}.`,
      );
    }

    const concurrency = options?.concurrency ?? this.config.concurrency;
    if (
      !Number.isInteger(concurrency) ||
      concurrency < 1 ||
      concurrency > MAX_WORKER_REGISTRATION_CONCURRENCY
    ) {
      throw new Error(
        `Worker concurrency must be an integer between 1 and ${MAX_WORKER_REGISTRATION_CONCURRENCY}.`,
      );
    }
    const jobNames = this.normalizeJobNames(options?.jobNames);
    const registration = {
      registrationKey,
      queueName,
      processor,
      jobNames: new Set(jobNames),
      concurrency,
    };
    this.registrations.set(registrationKey, registration);
    this.queueOwners.set(queueName, registrationKey);
    this.logger.log(
      `BullMQ logical worker registered: ${registrationKey} on queue ${queueName}.`,
    );
  }

  getWorker(registrationKey: string): Worker | undefined {
    const registration = this.registrations.get(registrationKey);
    return registration
      ? this.workers.get(registration.queueName)?.worker
      : undefined;
  }

  getRegisteredWorkers(): readonly Worker[] {
    return [...this.workers.values()].map(({ worker }) => worker);
  }

  private createWorker(registration: LogicalWorkerRegistration): RunningWorker {
    const connection = this.redisService.getClient().duplicate({
      connectionName: `worker:${registration.registrationKey}`,
      maxRetriesPerRequest: null,
    });
    let worker: Worker;
    try {
      worker = new Worker(
        registration.queueName,
        this.wrapProcessor(registration),
        {
          connection,
          prefix: this.queueService.getPrefix(),
          concurrency: registration.concurrency,
          lockDuration: this.config.lockDurationMs,
          stalledInterval: this.config.stalledIntervalMs,
          maxStalledCount: this.config.maxStalledCount,
          drainDelay: this.config.drainDelaySeconds,
          autorun: false,
        },
      );
    } catch (error) {
      connection.disconnect();
      throw error;
    }

    worker.on("ready", () => {
      this.logger.log(
        `BullMQ worker ready: ${registration.registrationKey} on queue ${registration.queueName}.`,
      );
    });
    worker.on("active", (job: Job) => {
      this.logger.log(
        `BullMQ worker ${registration.registrationKey} executing job ${job.id ?? "unknown"}` +
          `${this.formatJobContext(job)} attempt=${job.attemptsMade + 1}/${job.opts.attempts ?? 1}.`,
      );
    });
    worker.on("completed", (job: Job) => {
      this.logger.log(
        `BullMQ worker ${registration.registrationKey} completed job ${job.id ?? "unknown"}` +
          `${this.formatJobContext(job)} attemptsMade=${job.attemptsMade}.`,
      );
    });
    worker.on("failed", (job: Job | undefined, error: Error) => {
      const attempts = job?.opts.attempts ?? 1;
      const willRetry = Boolean(
        job &&
          !this.isUnrecoverableError(error) &&
          job.attemptsMade < attempts,
      );
      this.logger.error(
        `BullMQ worker ${registration.registrationKey} failed job ${job?.id ?? "unknown"}` +
          `${job ? this.formatJobContext(job) : ""} attemptsMade=${job?.attemptsMade ?? 0}` +
          ` willRetry=${willRetry}: ${this.getErrorCode(error)}`,
      );
    });
    worker.on("error", (error: Error) => {
      this.logger.error(
        `BullMQ worker ${registration.registrationKey} connection error: ${this.getErrorCode(error)}`,
      );
    });
    return { registration, worker, connection };
  }

  private wrapProcessor(registration: LogicalWorkerRegistration): Processor {
    return async (job: Job, token?: string, workerSignal?: AbortSignal) => {
      if (!registration.jobNames.has(job.name)) {
        throw new UnrecoverableError("BULLMQ_WORKER_JOB_NAME_UNREGISTERED");
      }
      try {
        const timeout = this.getJobTimeout(job);
        if (!timeout) {
          return await registration.processor(job, token, workerSignal);
        }

        const controller = new AbortController();
        const abortFromWorker = () => controller.abort(workerSignal?.reason);
        if (workerSignal?.aborted) abortFromWorker();
        else workerSignal?.addEventListener("abort", abortFromWorker, { once: true });

        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("BULLMQ_WORKER_JOB_TIMEOUT"));
          }, timeout);
        });
        try {
          return await Promise.race([
            registration.processor(job, token, controller.signal),
            timeoutPromise,
          ]);
        } finally {
          if (timer) clearTimeout(timer);
          workerSignal?.removeEventListener("abort", abortFromWorker);
        }
      } catch (error) {
        if (this.isUnrecoverableError(error)) throw error;
        throw new Error(this.getErrorCode(error));
      }
    };
  }

  private normalizeJobNames(value: unknown): readonly string[] {
    const names = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
    if (names.length === 0) {
      throw new Error("Worker registration must include at least one job name.");
    }
    for (const name of names) {
      this.assertSafeIdentity(name, "Worker job name");
    }
    if (new Set(names).size !== names.length) {
      throw new Error("Worker registration job names must be unique.");
    }
    return names;
  }

  private assertSafeIdentity(value: unknown, label: string): asserts value is string {
    if (
      typeof value !== "string" ||
      !value ||
      value !== value.trim() ||
      value.length > MAX_WORKER_IDENTITY_LENGTH ||
      !SAFE_WORKER_IDENTITY.test(value)
    ) {
      throw new Error(
        `${label} must be a trimmed safe ASCII string between 1 and ${MAX_WORKER_IDENTITY_LENGTH} characters.`,
      );
    }
  }

  private async submitDummyJob(): Promise<void> {
    const queue = this.queueService.registerQueue(PLATFORM_QUEUE_KEYS.WORKER_RUNTIME);
    if (!queue) return;
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

  private async closeRunningWorkers(running: readonly RunningWorker[]): Promise<void> {
    const results = await Promise.allSettled(
      running.map(async ({ registration, worker, connection }) => {
        try {
          await worker.close();
        } finally {
          await this.closeConnection(connection);
        }
        this.logger.log(`BullMQ worker stopped: ${registration.registrationKey}.`);
      }),
    );
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        this.logger.error(
          `Failed to stop BullMQ worker ${running[index].registration.registrationKey}: BULLMQ_WORKER_ERROR`,
        );
      }
    });
  }

  private async closeConnection(connection: Redis): Promise<void> {
    let ready = false;
    try {
      ready = connection.status === "ready";
    } catch {
      // Fall through to the exception-safe forced close.
    }
    if (ready) {
      try {
        await connection.quit();
        return;
      } catch {
        // A failed graceful close must fall back to disconnect without leaking details.
      }
    }
    try {
      await Promise.resolve(connection.disconnect() as unknown);
    } catch {
      // Cleanup is best-effort and must never escape or expose connection details.
    }
  }

  private getJobTimeout(job: Job): number | undefined {
    const timeout = (job.data as DispatcherJobData | undefined)?.runtime?.timeout;
    return typeof timeout === "number" && Number.isInteger(timeout) && timeout > 0
      ? timeout
      : undefined;
  }

  private formatJobContext(job: Job): string {
    const metadata = (job.data as DispatcherJobData | undefined)?.metadata;
    if (!metadata) return "";
    return ["correlationId", "tenantId", "requestId"]
      .map((key) => {
        const value = metadata[key as keyof typeof metadata];
        return value === undefined || value === null ? "" : ` ${key}=${String(value)}`;
      })
      .join("");
  }

  private getErrorCode(error: unknown): string {
    try {
      if (error instanceof HttpException) {
        const response = HttpException.prototype.getResponse.call(error);
        const responseCode = this.readOwnDataProperty(response, "code");
        if (this.isSafeErrorCode(responseCode)) return responseCode;
      }
      const directCode = this.readOwnDataProperty(error, "code");
      if (this.isSafeErrorCode(directCode)) return directCode;
      const message = this.readOwnDataProperty(error, "message");
      if (this.isSafeErrorCode(message)) return message;
    } catch {
      return "BULLMQ_WORKER_ERROR";
    }
    return "BULLMQ_WORKER_ERROR";
  }

  private readOwnDataProperty(value: unknown, key: string): unknown {
    if ((typeof value !== "object" || value === null) && typeof value !== "function") {
      return undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  }

  private isSafeErrorCode(value: unknown): value is string {
    return (
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= MAX_WORKER_IDENTITY_LENGTH &&
      /^[A-Z][A-Z0-9_]*$/.test(value)
    );
  }

  private isUnrecoverableError(error: unknown): error is UnrecoverableError {
    try {
      return error instanceof UnrecoverableError;
    } catch {
      return false;
    }
  }
}
