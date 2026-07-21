import { ConfigService } from "@nestjs/config";
import { DefaultJobOptions } from "bullmq";
import {
  DEFAULT_QUEUE_NAMES,
  PLATFORM_QUEUE_KEYS,
  PlatformQueueKey,
  QUEUE_NAME_ENV_KEYS,
} from "./queue.constants";

export interface QueueInfrastructureConfig {
  prefix: string;
  queueNames: Record<PlatformQueueKey, string>;
  defaultJobOptions: DefaultJobOptions;
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

function readQueueNames(
  configService: ConfigService,
): Record<PlatformQueueKey, string> {
  const queueNames = Object.values(PLATFORM_QUEUE_KEYS).reduce(
    (names, queueKey) => {
      const name = configService
        .get<string>(QUEUE_NAME_ENV_KEYS[queueKey], DEFAULT_QUEUE_NAMES[queueKey])
        .trim();

      if (!name || name.includes(":")) {
        throw new Error(
          `${QUEUE_NAME_ENV_KEYS[queueKey]} must be non-empty and cannot contain colons.`,
        );
      }

      names[queueKey] = name;
      return names;
    },
    {} as Record<PlatformQueueKey, string>,
  );

  if (new Set(Object.values(queueNames)).size !== Object.keys(queueNames).length) {
    throw new Error("BullMQ queue names must be unique.");
  }

  return queueNames;
}

export function getQueueConfig(
  configService: ConfigService,
): QueueInfrastructureConfig {
  const prefix = configService.get<string>("BULLMQ_PREFIX", "platform").trim();
  if (!prefix) {
    throw new Error("BULLMQ_PREFIX must not be empty.");
  }

  return {
    prefix,
    queueNames: readQueueNames(configService),
    defaultJobOptions: {
      attempts: readPositiveInteger(
        configService,
        "BULLMQ_DEFAULT_ATTEMPTS",
        1,
      ),
      removeOnComplete: readBoolean(
        configService,
        "BULLMQ_REMOVE_ON_COMPLETE",
        false,
      ),
      removeOnFail: readBoolean(
        configService,
        "BULLMQ_REMOVE_ON_FAIL",
        false,
      ),
    },
  };
}
