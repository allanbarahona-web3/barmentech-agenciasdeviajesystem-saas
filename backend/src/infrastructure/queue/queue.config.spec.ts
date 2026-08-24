import { ConfigService } from "@nestjs/config";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { FiscalBillingModule } from "../../fiscal-billing/fiscal-billing.module";
import { FiscalBillingSubmissionProcessor } from "../../fiscal-billing/jobs/fiscal-billing-submission.processor";
import {
  DEFAULT_QUEUE_NAMES,
  PLATFORM_QUEUE_KEYS,
  QUEUE_NAME_ENV_KEYS,
} from "./queue.constants";
import { getQueueConfig } from "./queue.config";

describe("queue configuration", () => {
  it("adds the dedicated fiscal queue without changing existing queue names", () => {
    expect(PLATFORM_QUEUE_KEYS).toEqual({
      BILLING: "billing",
      DOCUMENT: "document",
      EMAIL: "email",
      FISCAL_BILLING: "fiscal-billing",
      PDF: "pdf",
      NOTIFICATION: "notification",
      PACKAGE_COMPLETED: "package-completed",
      WORKER_RUNTIME: "worker-runtime",
    });
    expect(DEFAULT_QUEUE_NAMES).toEqual({
      billing: "billing",
      document: "document",
      email: "email",
      "fiscal-billing": "fiscal-billing",
      pdf: "pdf",
      notification: "notification",
      "package-completed": "package-completed",
      "worker-runtime": "worker-runtime",
    });
    expect(
      getQueueConfig(configService()).queueNames[
        PLATFORM_QUEUE_KEYS.FISCAL_BILLING
      ],
    ).toBe("fiscal-billing");
  });

  it("uses the existing BullMQ environment-name convention for the fiscal queue", () => {
    expect(
      QUEUE_NAME_ENV_KEYS[PLATFORM_QUEUE_KEYS.FISCAL_BILLING],
    ).toBe("BULLMQ_FISCAL_BILLING_QUEUE_NAME");
    expect(
      getQueueConfig(
        configService({
          BULLMQ_FISCAL_BILLING_QUEUE_NAME: "fiscal-custom",
        }),
      ).queueNames[PLATFORM_QUEUE_KEYS.FISCAL_BILLING],
    ).toBe("fiscal-custom");
  });

  it("registers the fiscal processor without adding another queue", () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      FiscalBillingModule,
    ) as Array<{ name?: string }>;

    expect(providers).toContain(FiscalBillingSubmissionProcessor);
    expect(
      Object.values(PLATFORM_QUEUE_KEYS).filter(
        (queueKey) => queueKey === PLATFORM_QUEUE_KEYS.FISCAL_BILLING,
      ),
    ).toHaveLength(1);
  });
});

function configService(values: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string, defaultValue: unknown) =>
      key in values ? values[key] : defaultValue,
    ),
  } as unknown as ConfigService;
}
