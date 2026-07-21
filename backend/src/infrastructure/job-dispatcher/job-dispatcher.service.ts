import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, JobsOptions, Queue } from "bullmq";
import { PlatformQueueKey, QueueService } from "../queue";
import {
  getJobDispatcherConfig,
  JobDispatcherConfig,
} from "./job-dispatcher.config";

export type JobMetadataValue = string | number | boolean | null;

export interface JobDispatchMetadata {
  correlationId?: string;
  tenantId?: string;
  requestId?: string;
  [key: string]: JobMetadataValue | undefined;
}

export interface JobEnvelope<TPayload> {
  payload: TPayload;
  metadata?: JobDispatchMetadata;
}

export interface GenericDispatchOptions {
  jobId?: string;
  priority?: number;
}

export interface DispatchRequest<TPayload> {
  queueKey: PlatformQueueKey;
  jobName: string;
  payload: TPayload;
  metadata?: JobDispatchMetadata;
  options?: GenericDispatchOptions;
}

export interface DelayedDispatchRequest<TPayload>
  extends DispatchRequest<TPayload> {
  delayMs: number;
}

export interface BulkDispatchItem<TPayload> {
  jobName: string;
  payload: TPayload;
  metadata?: JobDispatchMetadata;
  options?: GenericDispatchOptions;
  delayMs?: number;
}

@Injectable()
export class JobDispatcherService implements OnModuleInit {
  private readonly logger = new Logger(JobDispatcherService.name);
  private readonly config: JobDispatcherConfig;

  constructor(
    private readonly queueService: QueueService,
    configService: ConfigService,
  ) {
    this.config = getJobDispatcherConfig(configService);
  }

  onModuleInit(): void {
    this.logger.log(
      this.config.enabled
        ? "Generic job dispatcher initialized."
        : "Generic job dispatcher is disabled.",
    );
  }

  dispatch<TPayload>(
    request: DispatchRequest<TPayload>,
  ): Promise<Job<JobEnvelope<TPayload>>> {
    return this.dispatchInternal(request);
  }

  dispatchDelayed<TPayload>(
    request: DelayedDispatchRequest<TPayload>,
  ): Promise<Job<JobEnvelope<TPayload>>> {
    this.validateDelay(request.delayMs);
    return this.dispatchInternal(request, request.delayMs);
  }

  async dispatchBulk<TPayload>(
    queueKey: PlatformQueueKey,
    items: readonly BulkDispatchItem<TPayload>[],
  ): Promise<Job<JobEnvelope<TPayload>>[]> {
    this.assertEnabled();

    if (items.length === 0) {
      throw new Error("Bulk dispatch requires at least one job.");
    }
    if (items.length > this.config.maxBulkSize) {
      throw new Error(
        `Bulk dispatch exceeds the configured limit of ${this.config.maxBulkSize} jobs.`,
      );
    }

    const startedAt = Date.now();
    const { queue, queueName } = this.resolveQueue(queueKey);

    try {
      const jobs = await queue.addBulk(
        items.map((item) => {
          this.validateJobName(item.jobName);
          if (item.delayMs !== undefined) {
            this.validateDelay(item.delayMs);
          }

          return {
            name: item.jobName,
            data: this.createEnvelope(item.payload, item.metadata),
            opts: this.createJobOptions(item.options, item.delayMs),
          };
        }),
      );

      this.logInfrastructure(
        `Dispatched ${jobs.length} jobs to queue ${queueName} in ${Date.now() - startedAt}ms.`,
      );
      return jobs as Job<JobEnvelope<TPayload>>[];
    } catch (error) {
      this.logger.error(
        `Bulk dispatch to queue ${queueName} failed after ${Date.now() - startedAt}ms: ${this.getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  private async dispatchInternal<TPayload>(
    request: DispatchRequest<TPayload>,
    delayMs?: number,
  ): Promise<Job<JobEnvelope<TPayload>>> {
    this.assertEnabled();
    this.validateJobName(request.jobName);

    const startedAt = Date.now();
    const { queue, queueName } = this.resolveQueue(request.queueKey);

    try {
      const job = await queue.add(
        request.jobName,
        this.createEnvelope(request.payload, request.metadata),
        this.createJobOptions(request.options, delayMs),
      );

      this.logInfrastructure(
        `Dispatched job ${job.id ?? "unknown"} to queue ${queueName} in ${Date.now() - startedAt}ms.`,
      );
      return job as Job<JobEnvelope<TPayload>>;
    } catch (error) {
      this.logger.error(
        `Dispatch to queue ${queueName} failed after ${Date.now() - startedAt}ms: ${this.getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  private resolveQueue(queueKey: PlatformQueueKey): {
    queue: Queue;
    queueName: string;
  } {
    const queueName = this.queueService.getConfiguredQueueName(queueKey);
    if (!queueName) {
      throw new Error(`Queue is not configured: ${String(queueKey)}.`);
    }

    const queue =
      this.queueService.getQueue(queueKey) ??
      this.queueService.registerQueue(queueKey);
    if (!queue) {
      throw new Error(`Queue is unavailable: ${queueName}.`);
    }

    this.logInfrastructure(`Resolved queue ${queueName}.`);
    return { queue, queueName };
  }

  private createEnvelope<TPayload>(
    payload: TPayload,
    metadata?: JobDispatchMetadata,
  ): JobEnvelope<TPayload> {
    return metadata ? { payload, metadata: { ...metadata } } : { payload };
  }

  private createJobOptions(
    options?: GenericDispatchOptions,
    delayMs?: number,
  ): JobsOptions {
    return {
      ...(options?.jobId ? { jobId: options.jobId } : {}),
      ...(options?.priority !== undefined ? { priority: options.priority } : {}),
      ...(delayMs !== undefined ? { delay: delayMs } : {}),
    };
  }

  private validateJobName(jobName: string): void {
    if (!jobName.trim()) {
      throw new Error("Job name must not be empty.");
    }
  }

  private validateDelay(delayMs: number): void {
    if (
      !Number.isInteger(delayMs) ||
      delayMs < 1 ||
      delayMs > this.config.maxDelayMs
    ) {
      throw new Error(
        `Job delay must be an integer between 1 and ${this.config.maxDelayMs} milliseconds.`,
      );
    }
  }

  private assertEnabled(): void {
    if (!this.config.enabled) {
      throw new Error("Generic job dispatcher is disabled.");
    }
  }

  private logInfrastructure(message: string): void {
    switch (this.config.logLevel) {
      case "debug":
        this.logger.debug(message);
        break;
      case "warn":
        this.logger.warn(message);
        break;
      default:
        this.logger.log(message);
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown job dispatch error";
  }
}
