import { ConfigService } from "@nestjs/config";
import {
  QUEUE_EVENTS_LOG_LEVELS,
  QueueEventsLogLevel,
} from "./queue-events.constants";

export interface QueueEventsInfrastructureConfig {
  enabled: boolean;
  defaultListeners: boolean;
  logLevel: QueueEventsLogLevel;
  blockingTimeoutMs: number;
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

function readPositiveInteger(
  configService: ConfigService,
  key: string,
  defaultValue: number,
): number {
  const rawValue = configService.get<string>(key, "").trim();

  if (!rawValue) {
    return defaultValue;
  }

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer.`);
  }

  return value;
}

export function getQueueEventsConfig(
  configService: ConfigService,
): QueueEventsInfrastructureConfig {
  const logLevel = configService
    .get<string>("QUEUE_EVENTS_LOG_LEVEL", "info")
    .trim()
    .toLowerCase() as QueueEventsLogLevel;

  if (!QUEUE_EVENTS_LOG_LEVELS.includes(logLevel)) {
    throw new Error(
      `QUEUE_EVENTS_LOG_LEVEL must be one of: ${QUEUE_EVENTS_LOG_LEVELS.join(", ")}.`,
    );
  }

  return {
    enabled: readBoolean(configService, "QUEUE_EVENTS_ENABLED", true),
    defaultListeners: readBoolean(
      configService,
      "QUEUE_EVENTS_DEFAULT_LISTENERS",
      true,
    ),
    logLevel,
    blockingTimeoutMs: readPositiveInteger(
      configService,
      "QUEUE_EVENTS_BLOCKING_TIMEOUT_MS",
      10000,
    ),
  };
}
