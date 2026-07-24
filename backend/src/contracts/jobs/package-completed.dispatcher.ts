import { Injectable, OnModuleInit } from "@nestjs/common";
import { QueueEvents } from "bullmq";
import { JobDispatcherService } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS, QueueService } from "../../infrastructure/queue";
import { QueueEventsService } from "../../infrastructure/queue-events";
import {
  getPackageCompletedJobId,
  PACKAGE_COMPLETED_JOB_NAME,
  PACKAGE_COMPLETED_QUEUE_EVENTS_REGISTRATION_KEY,
} from "./package-completed-job.constants";
import { PackageCompletedJobPayload } from "./package-completed-job.types";

@Injectable()
export class PackageCompletedDispatcher implements OnModuleInit {
  private queueEvents: QueueEvents | null = null;

  constructor(
    private readonly queueService: QueueService,
    private readonly queueEventsService: QueueEventsService,
    private readonly jobDispatcher: JobDispatcherService,
  ) {}

  onModuleInit(): void {
    this.queueService.registerQueue(PLATFORM_QUEUE_KEYS.PACKAGE_COMPLETED);
    this.queueEvents = this.queueEventsService.registerQueueEvents(
      PACKAGE_COMPLETED_QUEUE_EVENTS_REGISTRATION_KEY,
      this.queueService.getConfiguredQueueName(
        PLATFORM_QUEUE_KEYS.PACKAGE_COMPLETED,
      ),
    );
  }

  async dispatch(payload: PackageCompletedJobPayload): Promise<void> {
    const job = await this.jobDispatcher.dispatch<PackageCompletedJobPayload>({
      queueKey: PLATFORM_QUEUE_KEYS.PACKAGE_COMPLETED,
      jobName: PACKAGE_COMPLETED_JOB_NAME,
      payload,
      metadata: {
        correlationId: payload.correlationId,
        tenantId: payload.tenantId,
      },
      options: {
        jobId: getPackageCompletedJobId(payload.documentSigningSessionId),
      },
    });

    if (!this.queueEvents) {
      throw new Error(
        "PackageCompleted QueueEvents is required to await Billing bootstrap.",
      );
    }

    await job.waitUntilFinished(this.queueEvents);
  }
}
