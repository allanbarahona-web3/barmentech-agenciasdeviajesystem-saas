import { ConfigService } from "@nestjs/config";

export interface RedisConfig {
  enabled: boolean;
  url?: string;
  host?: string;
  port: number;
  username?: string;
  password?: string;
  database: number;
  tls: boolean;
  connectTimeoutMs: number;
  maxRetryDelayMs: number;
}

function readInteger(
  configService: ConfigService,
  key: string,
  defaultValue: number,
): number {
  const rawValue = configService.get<string>(key, "").trim();

  if (!rawValue) {
    return defaultValue;
  }

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer.`);
  }

  return value;
}

export function getRedisConfig(configService: ConfigService): RedisConfig {
  const url = configService.get<string>("REDIS_URL", "").trim();
  const host = configService.get<string>("REDIS_HOST", "").trim();
  const tls = configService
    .get<string>("REDIS_TLS", "false")
    .trim()
    .toLowerCase();

  if (tls !== "true" && tls !== "false") {
    throw new Error("REDIS_TLS must be either true or false.");
  }

  return {
    enabled: Boolean(url || host),
    url: url || undefined,
    host: host || undefined,
    port: readInteger(configService, "REDIS_PORT", 6379),
    username:
      configService.get<string>("REDIS_USERNAME", "").trim() || undefined,
    password:
      configService.get<string>("REDIS_PASSWORD", "").trim() || undefined,
    database: readInteger(configService, "REDIS_DB", 0),
    tls: tls === "true",
    connectTimeoutMs: readInteger(
      configService,
      "REDIS_CONNECT_TIMEOUT_MS",
      10000,
    ),
    maxRetryDelayMs: readInteger(
      configService,
      "REDIS_MAX_RETRY_DELAY_MS",
      30000,
    ),
  };
}
