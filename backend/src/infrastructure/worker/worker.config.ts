import { ConfigService } from "@nestjs/config";
import { DEFAULT_DUMMY_JOB_NAME } from "./worker.constants";

export interface WorkerRuntimeConfig {
  concurrency: number;
  lockDurationMs: number;
  stalledIntervalMs: number;
  maxStalledCount: number;
  drainDelaySeconds: number;
  dummyWorkerEnabled: boolean;
  dummyJobName: string;
}

function readBoolean(
  configService: ConfigService,
  key: string,
  defaultValue: boolean,
): boolean {
  const rawValue = configService.get<string>(key, "").trim().toLowerCase();

  if (!rawValue) {
    return defaultValue;
  }

  if (rawValue !== "true" && rawValue !== "false") {
    throw new Error(`${key} must be either true or false.`);
  }

  return rawValue === "true";
}

function readInteger(
  configService: ConfigService,
  key: string,
  defaultValue: number,
  minimum: number,
): number {
  const rawValue = configService.get<string>(key, "").trim();

  if (!rawValue) {
    return defaultValue;
  }

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${key} must be an integer greater than or equal to ${minimum}.`);
  }

  return value;
}

export function getWorkerConfig(
  configService: ConfigService,
): WorkerRuntimeConfig {
  const dummyJobName = configService
    .get<string>("BULLMQ_DUMMY_JOB_NAME", DEFAULT_DUMMY_JOB_NAME)
    .trim();

  if (!dummyJobName) {
    throw new Error("BULLMQ_DUMMY_JOB_NAME must not be empty.");
  }

  return {
    concurrency: readInteger(
      configService,
      "BULLMQ_WORKER_CONCURRENCY",
      1,
      1,
    ),
    lockDurationMs: readInteger(
      configService,
      "BULLMQ_WORKER_LOCK_DURATION_MS",
      30000,
      1,
    ),
    stalledIntervalMs: readInteger(
      configService,
      "BULLMQ_WORKER_STALLED_INTERVAL_MS",
      30000,
      1,
    ),
    maxStalledCount: readInteger(
      configService,
      "BULLMQ_WORKER_MAX_STALLED_COUNT",
      1,
      0,
    ),
    drainDelaySeconds: readInteger(
      configService,
      "BULLMQ_WORKER_DRAIN_DELAY_SECONDS",
      5,
      1,
    ),
    dummyWorkerEnabled: readBoolean(
      configService,
      "BULLMQ_DUMMY_WORKER_ENABLED",
      false,
    ),
    dummyJobName,
  };
}
