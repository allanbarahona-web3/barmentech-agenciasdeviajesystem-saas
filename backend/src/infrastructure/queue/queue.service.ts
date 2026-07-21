import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { RedisService } from "../redis";
import { getQueueConfig, QueueInfrastructureConfig } from "./queue.config";
import { PlatformQueueKey } from "./queue.constants";

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly config: QueueInfrastructureConfig;
  private readonly queues = new Map<PlatformQueueKey, Queue>();

  constructor(
    private readonly redisService: RedisService,
    configService: ConfigService,
  ) {
    this.config = getQueueConfig(configService);
  }

  onModuleInit(): void {
    if (!this.redisService.isEnabled()) {
      this.logger.log("BullMQ is disabled because Redis is not configured.");
      return;
    }

    const connectionStatus = this.redisService.isReady()
      ? "ready"
      : "connecting";
    this.logger.log(
      `BullMQ initialized with shared Redis connection (${connectionStatus}); no queues registered.`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    const queues = [...this.queues.values()];
    this.queues.clear();

    const results = await Promise.allSettled(
      queues.map((queue) => queue.close()),
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        this.logger.error(
          `Failed to close BullMQ queue ${queues[index].name}: ${this.getErrorMessage(result.reason)}`,
        );
      }
    });
  }

  registerQueue(queueKey: PlatformQueueKey): Queue | null {
    if (!this.redisService.isEnabled()) {
      this.logger.warn(
        `BullMQ queue ${this.config.queueNames[queueKey]} was not registered because Redis is disabled.`,
      );
      return null;
    }

    const existingQueue = this.queues.get(queueKey);
    if (existingQueue) {
      return existingQueue;
    }

    const queueName = this.config.queueNames[queueKey];
    const queue = new Queue(queueName, {
      connection: this.redisService.getClient(),
      prefix: this.config.prefix,
      defaultJobOptions: this.config.defaultJobOptions,
    });

    queue.on("error", (error: Error) => {
      this.logger.error(`BullMQ queue ${queueName} connection error: ${error.message}`);
    });

    this.queues.set(queueKey, queue);
    this.logger.log(`BullMQ queue registered: ${queueName}.`);
    return queue;
  }

  getQueue(queueKey: PlatformQueueKey): Queue | undefined {
    return this.queues.get(queueKey);
  }

  getConfiguredQueueName(queueKey: PlatformQueueKey): string {
    return this.config.queueNames[queueKey];
  }

  getRegisteredQueues(): readonly Queue[] {
    return [...this.queues.values()];
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown BullMQ error";
  }
}
