import { ConfigService } from "@nestjs/config";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { FiscalBillingModule } from "../../fiscal-billing/fiscal-billing.module";
import { FiscalBillingSubmissionProcessor } from "../../fiscal-billing/jobs/fiscal-billing-submission.processor";
import { AccountReceivableRecognitionProcessor } from "../../fiscal-billing/jobs/account-receivable-recognition.processor";
import { FiscalArtifactRetrievalProcessor } from "../../fiscal-billing/jobs/fiscal-artifact-retrieval.processor";
import { FiscalArtifactRetrievalPublisher } from "../../fiscal-billing/jobs/fiscal-artifact-retrieval.publisher";
import { FiscalInvoiceAutoDeliveryProcessor } from "../../fiscal-billing/jobs/fiscal-invoice-auto-delivery.processor";
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
      FISCAL_STATUS_RECONCILIATION: "fiscal-status-reconciliation",
      FISCAL_REFRESH_RECONCILIATION: "fiscal-refresh-reconciliation",
      ACCOUNT_RECEIVABLE_RECOGNITION: "account-receivable-recognition",
      FISCAL_ARTIFACT_RETRIEVAL: "fiscal-artifact-retrieval",
      FISCAL_INVOICE_AUTO_DELIVERY: "fiscal-invoice-auto-delivery",
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
      "fiscal-status-reconciliation": "fiscal-status-reconciliation",
      "fiscal-refresh-reconciliation": "fiscal-refresh-reconciliation",
      "account-receivable-recognition": "account-receivable-recognition",
      "fiscal-artifact-retrieval": "fiscal-artifact-retrieval",
      "fiscal-invoice-auto-delivery": "fiscal-invoice-auto-delivery",
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
    expect(
      getQueueConfig(configService()).queueNames[
        PLATFORM_QUEUE_KEYS.FISCAL_STATUS_RECONCILIATION
      ],
    ).toBe("fiscal-status-reconciliation");
    expect(
      getQueueConfig(configService()).queueNames[
        PLATFORM_QUEUE_KEYS.FISCAL_REFRESH_RECONCILIATION
      ],
    ).toBe("fiscal-refresh-reconciliation");
    expect(getQueueConfig(configService()).queueNames[PLATFORM_QUEUE_KEYS.ACCOUNT_RECEIVABLE_RECOGNITION]).toBe("account-receivable-recognition");
    expect(getQueueConfig(configService()).queueNames[PLATFORM_QUEUE_KEYS.FISCAL_ARTIFACT_RETRIEVAL]).toBe("fiscal-artifact-retrieval");
    expect(getQueueConfig(configService()).queueNames[PLATFORM_QUEUE_KEYS.FISCAL_INVOICE_AUTO_DELIVERY]).toBe("fiscal-invoice-auto-delivery");
  });

  it("uses stable optional environment-name keys for both reconciliation queues", () => {
    expect(
      QUEUE_NAME_ENV_KEYS[PLATFORM_QUEUE_KEYS.FISCAL_STATUS_RECONCILIATION],
    ).toBe("BULLMQ_FISCAL_STATUS_RECONCILIATION_QUEUE_NAME");
    expect(
      QUEUE_NAME_ENV_KEYS[PLATFORM_QUEUE_KEYS.FISCAL_REFRESH_RECONCILIATION],
    ).toBe("BULLMQ_FISCAL_REFRESH_RECONCILIATION_QUEUE_NAME");
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

  it("uses the existing BullMQ environment-name convention for receivable recognition", () => {
    expect(QUEUE_NAME_ENV_KEYS[PLATFORM_QUEUE_KEYS.ACCOUNT_RECEIVABLE_RECOGNITION]).toBe("BULLMQ_ACCOUNT_RECEIVABLE_RECOGNITION_QUEUE_NAME");
  });

  it("resolves the artifact queue override and rejects physical collisions", () => {
    expect(QUEUE_NAME_ENV_KEYS[PLATFORM_QUEUE_KEYS.FISCAL_ARTIFACT_RETRIEVAL]).toBe("BULLMQ_FISCAL_ARTIFACT_RETRIEVAL_QUEUE_NAME");
    expect(getQueueConfig(configService({ BULLMQ_FISCAL_ARTIFACT_RETRIEVAL_QUEUE_NAME: "artifact-custom" })).queueNames[PLATFORM_QUEUE_KEYS.FISCAL_ARTIFACT_RETRIEVAL]).toBe("artifact-custom");
    expect(() => getQueueConfig(configService({ BULLMQ_FISCAL_ARTIFACT_RETRIEVAL_QUEUE_NAME: "fiscal-billing" }))).toThrow("BullMQ queue names must be unique.");
  });

  it("resolves the invoice delivery queue override", () => {
    expect(QUEUE_NAME_ENV_KEYS[PLATFORM_QUEUE_KEYS.FISCAL_INVOICE_AUTO_DELIVERY]).toBe("BULLMQ_FISCAL_INVOICE_AUTO_DELIVERY_QUEUE_NAME");
    expect(getQueueConfig(configService({ BULLMQ_FISCAL_INVOICE_AUTO_DELIVERY_QUEUE_NAME: "invoice-email-custom" })).queueNames[PLATFORM_QUEUE_KEYS.FISCAL_INVOICE_AUTO_DELIVERY]).toBe("invoice-email-custom");
  });

  it("registers the fiscal processor with three distinct fiscal queues", () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      FiscalBillingModule,
    ) as Array<{ name?: string }>;

    expect(providers).toContain(FiscalBillingSubmissionProcessor);
    expect(providers).toContain(AccountReceivableRecognitionProcessor);
    expect(providers.filter((value) => value === FiscalArtifactRetrievalPublisher)).toHaveLength(1);
    expect(providers.filter((value) => value === FiscalArtifactRetrievalProcessor)).toHaveLength(1);
    expect(providers.filter((value) => value === FiscalInvoiceAutoDeliveryProcessor)).toHaveLength(1);
    expect(new Set([
      PLATFORM_QUEUE_KEYS.FISCAL_BILLING,
      PLATFORM_QUEUE_KEYS.FISCAL_STATUS_RECONCILIATION,
      PLATFORM_QUEUE_KEYS.FISCAL_REFRESH_RECONCILIATION,
      PLATFORM_QUEUE_KEYS.ACCOUNT_RECEIVABLE_RECOGNITION,
      PLATFORM_QUEUE_KEYS.FISCAL_ARTIFACT_RETRIEVAL,
      PLATFORM_QUEUE_KEYS.FISCAL_INVOICE_AUTO_DELIVERY,
    ]).size).toBe(6);
  });
});

function configService(values: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string, defaultValue: unknown) =>
      key in values ? values[key] : defaultValue,
    ),
  } as unknown as ConfigService;
}
