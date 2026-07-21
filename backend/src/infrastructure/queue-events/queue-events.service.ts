import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QueueEvents, QueueEventsListener } from "bullmq";
import { QueueService } from "../queue";
import { RedisService } from "../redis";
import {
  getQueueEventsConfig,
  QueueEventsInfrastructureConfig,
} from "./queue-events.config";
import {
  SUPPORTED_QUEUE_EVENTS,
  SupportedQueueEvent,
} from "./queue-events.constants";

@Injectable()
export class QueueEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueEventsService.name);
  private readonly config: QueueEventsInfrastructureConfig;
  private readonly registry = new Map<string, QueueEvents>();

  constructor(
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
    configService: ConfigService,
  ) {
    this.config = getQueueEventsConfig(configService);
  }

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log("BullMQ QueueEvents infrastructure is disabled.");
      return;
    }

    if (!this.redisService.isEnabled()) {
      this.logger.log(
        "BullMQ QueueEvents infrastructure is inactive because Redis is not configured.",
      );
      return;
    }

    this.logger.log(
      "BullMQ QueueEvents infrastructure initialized; no queues registered.",
    );
  }

  async onModuleDestroy(): Promise<void> {
    const registrations = [...this.registry.entries()];
    this.registry.clear();

    const results = await Promise.allSettled(
      registrations.map(([, queueEvents]) => queueEvents.close()),
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        this.logger.error(
          `Failed to close BullMQ QueueEvents ${registrations[index][0]}: ${this.getErrorMessage(result.reason)}`,
        );
      }
    });
  }

  registerQueueEvents(
    registrationKey: string,
    queueName: string,
  ): QueueEvents | null {
    const normalizedRegistrationKey = registrationKey.trim();
    const normalizedQueueName = queueName.trim();

    if (!normalizedRegistrationKey) {
      throw new Error("QueueEvents registration key must not be empty.");
    }
    if (!normalizedQueueName || normalizedQueueName.includes(":")) {
      throw new Error("QueueEvents queue name must be non-empty and cannot contain colons.");
    }

    if (!this.config.enabled || !this.redisService.isEnabled()) {
      this.logger.warn(
        `BullMQ QueueEvents ${normalizedRegistrationKey} was not registered because the infrastructure is disabled.`,
      );
      return null;
    }

    const existingQueueEvents = this.registry.get(normalizedRegistrationKey);
    if (existingQueueEvents) {
      if (existingQueueEvents.name !== normalizedQueueName) {
        throw new Error(
          `BullMQ QueueEvents registration ${normalizedRegistrationKey} already targets queue ${existingQueueEvents.name}.`,
        );
      }
      return existingQueueEvents;
    }

    const connectionTemplate = this.redisService.getClient().duplicate({
      connectionName: `queue-events:${normalizedRegistrationKey}`,
      maxRetriesPerRequest: null,
    });
    let queueEvents: QueueEvents;

    try {
      queueEvents = new QueueEvents(normalizedQueueName, {
        connection: connectionTemplate,
        prefix: this.queueService.getPrefix(),
        blockingTimeout: this.config.blockingTimeoutMs,
      });
    } finally {
      connectionTemplate.disconnect();
    }

    queueEvents.on("error", (error: Error) => {
      this.logger.error(
        `BullMQ QueueEvents ${normalizedRegistrationKey} connection error: ${error.message}`,
      );
    });
    void queueEvents
      .waitUntilReady()
      .then(() => {
        this.logger.log(`BullMQ QueueEvents ready: ${normalizedRegistrationKey}.`);
      })
      .catch((error: unknown) => {
        this.logger.error(
          `BullMQ QueueEvents ${normalizedRegistrationKey} failed to become ready: ${this.getErrorMessage(error)}`,
        );
      });

    if (this.config.defaultListeners) {
      for (const eventName of SUPPORTED_QUEUE_EVENTS) {
        this.attachInfrastructureListener(
          normalizedRegistrationKey,
          queueEvents,
          eventName,
        );
      }
    }

    this.registry.set(normalizedRegistrationKey, queueEvents);
    this.logger.log(
      `BullMQ QueueEvents registered: ${normalizedRegistrationKey} on queue ${normalizedQueueName}.`,
    );
    return queueEvents;
  }

  getQueueEvents(registrationKey: string): QueueEvents | undefined {
    return this.registry.get(registrationKey.trim());
  }

  getRegisteredQueueEvents(): readonly QueueEvents[] {
    return [...this.registry.values()];
  }

  subscribe<TEvent extends SupportedQueueEvent>(
    registrationKey: string,
    eventName: TEvent,
    listener: QueueEventsListener[TEvent],
  ): () => void {
    const normalizedRegistrationKey = registrationKey.trim();
    const queueEvents = this.registry.get(normalizedRegistrationKey);
    if (!queueEvents) {
      throw new Error(
        `BullMQ QueueEvents registration not found: ${normalizedRegistrationKey}.`,
      );
    }

    queueEvents.on(eventName, listener);
    return () => {
      queueEvents.off(eventName, listener);
    };
  }

  private attachInfrastructureListener<TEvent extends SupportedQueueEvent>(
    registrationKey: string,
    queueEvents: QueueEvents,
    eventName: TEvent,
  ): void {
    const listener = ((...args: unknown[]) => {
      const jobId = this.getJobId(args[0]);
      const suffix = jobId ? ` jobId=${jobId}` : "";
      this.logInfrastructureEvent(
        `BullMQ QueueEvents ${registrationKey}: ${eventName}${suffix}.`,
      );
    }) as QueueEventsListener[TEvent];

    queueEvents.on(eventName, listener);
  }

  private getJobId(payload: unknown): string | undefined {
    if (!payload || typeof payload !== "object" || !("jobId" in payload)) {
      return undefined;
    }

    const jobId = (payload as { jobId?: unknown }).jobId;
    return typeof jobId === "string" ? jobId : undefined;
  }

  private logInfrastructureEvent(message: string): void {
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
    return error instanceof Error ? error.message : "Unknown BullMQ QueueEvents error";
  }
}
