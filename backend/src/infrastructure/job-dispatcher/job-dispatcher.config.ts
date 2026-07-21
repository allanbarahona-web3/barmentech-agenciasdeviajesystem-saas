import { ConfigService } from "@nestjs/config";
import {
  JOB_DISPATCHER_LOG_LEVELS,
  JobDispatcherLogLevel,
} from "./job-dispatcher.constants";

export interface JobDispatcherConfig {
  enabled: boolean;
  logLevel: JobDispatcherLogLevel;
  maxBulkSize: number;
  maxDelayMs: number;
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

export function getJobDispatcherConfig(
  configService: ConfigService,
): JobDispatcherConfig {
  const logLevel = configService
    .get<string>("JOB_DISPATCHER_LOG_LEVEL", "info")
    .trim()
    .toLowerCase() as JobDispatcherLogLevel;

  if (!JOB_DISPATCHER_LOG_LEVELS.includes(logLevel)) {
    throw new Error(
      `JOB_DISPATCHER_LOG_LEVEL must be one of: ${JOB_DISPATCHER_LOG_LEVELS.join(", ")}.`,
    );
  }

  return {
    enabled: readBoolean(configService, "JOB_DISPATCHER_ENABLED", true),
    logLevel,
    maxBulkSize: readPositiveInteger(
      configService,
      "JOB_DISPATCHER_MAX_BULK_SIZE",
      1000,
    ),
    maxDelayMs: readPositiveInteger(
      configService,
      "JOB_DISPATCHER_MAX_DELAY_MS",
      2147483647,
    ),
  };
}
