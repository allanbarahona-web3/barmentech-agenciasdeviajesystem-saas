import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis, RedisOptions } from "ioredis";
import { getRedisConfig, RedisConfig } from "./redis.config";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly config: RedisConfig;
  private readonly client: Redis | null;

  constructor(configService: ConfigService) {
    this.config = getRedisConfig(configService);
    this.client = this.config.enabled ? this.createClient() : null;
  }

  onModuleInit(): void {
    if (!this.client) {
      this.logger.log("Redis is not configured; connection is disabled.");
      return;
    }

    void this.client.connect().catch((error: unknown) => {
      this.logger.error(
        `Redis initial connection failed; application startup will continue: ${this.getErrorMessage(error)}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) {
      return;
    }

    if (this.client.status === "ready") {
      await this.client.quit();
      return;
    }

    this.client.disconnect();
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  isReady(): boolean {
    return this.client?.status === "ready";
  }

  getClient(): Redis {
    if (!this.client) {
      throw new ServiceUnavailableException("Redis is not configured.");
    }

    return this.client;
  }

  async ping(): Promise<boolean> {
    if (!this.client || this.client.status !== "ready") {
      return false;
    }

    try {
      return (await this.client.ping()) === "PONG";
    } catch (error) {
      this.logger.error(`Redis health check failed: ${this.getErrorMessage(error)}`);
      return false;
    }
  }

  private createClient(): Redis {
    const options: RedisOptions = {
      lazyConnect: true,
      enableReadyCheck: true,
      connectTimeout: this.config.connectTimeoutMs,
      db: this.config.database,
      username: this.config.username,
      password: this.config.password,
      tls: this.config.tls ? {} : undefined,
      retryStrategy: (attempt: number) => {
        const delay = Math.min(
          attempt * 500,
          this.config.maxRetryDelayMs,
        );
        this.logger.warn(
          `Redis reconnect attempt ${attempt} scheduled in ${delay}ms.`,
        );
        return delay;
      },
    };

    const client = this.config.url
      ? new Redis(this.config.url, options)
      : new Redis({
          ...options,
          host: this.config.host,
          port: this.config.port,
        });

    client.on("ready", () => {
      this.logger.log("Redis connection established.");
    });
    client.on("error", (error: Error) => {
      this.logger.error(`Redis connection failed: ${error.message}`);
    });

    return client;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown Redis error";
  }
}
