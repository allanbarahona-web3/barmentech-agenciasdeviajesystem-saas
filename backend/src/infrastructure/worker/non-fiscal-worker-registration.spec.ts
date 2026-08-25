import { ReceiptProcessingWorker } from "../../billing/jobs/receipt-processing.worker";
import { BILLING_BOOTSTRAP_JOB_NAME } from "../../billing/jobs/billing-bootstrap-job.constants";
import { RECEIPT_PROCESSING_JOB_NAME } from "../../billing/jobs/receipt-processing-job.constants";
import { AuthEmailWorker } from "../../email/jobs/auth-email.worker";
import { AUTH_EMAIL_JOB_NAMES } from "../../email/jobs/auth-email-job.constants";
import { BILLING_FINANCIAL_EMAIL_JOB_NAMES } from "../../email/jobs/billing-financial-email-job.constants";
import { CONTRACTS_EMAIL_JOB_NAMES } from "../../email/jobs/contracts-email-job.constants";
import { SIGNED_DOCUMENT_EMAIL_JOB_NAMES } from "../../email/jobs/signed-document-email-job.constants";
import { PLATFORM_QUEUE_KEYS } from "../queue";

describe("non-fiscal multi-name worker registration", () => {
  it("keeps receipt processing and bootstrap on one billing registration", () => {
    const registerWorker = jest.fn();
    const worker = new ReceiptProcessingWorker(
      { registerWorker } as never,
      {} as never,
      {} as never,
    );

    worker.onModuleInit();

    expect(registerWorker).toHaveBeenCalledWith(
      "billing-receipt-processing-worker",
      PLATFORM_QUEUE_KEYS.BILLING,
      expect.any(Function),
      { jobNames: [RECEIPT_PROCESSING_JOB_NAME, BILLING_BOOTSTRAP_JOB_NAME] },
    );
  });

  it("keeps every existing email name on one email registration", () => {
    const registerWorker = jest.fn();
    const worker = new AuthEmailWorker(
      { registerWorker } as never,
      {} as never,
    );

    worker.onModuleInit();

    expect(registerWorker).toHaveBeenCalledWith(
      "auth-email-worker",
      PLATFORM_QUEUE_KEYS.EMAIL,
      expect.any(Function),
      {
        jobNames: [
          ...Object.values(AUTH_EMAIL_JOB_NAMES),
          ...Object.values(CONTRACTS_EMAIL_JOB_NAMES),
          ...Object.values(BILLING_FINANCIAL_EMAIL_JOB_NAMES),
          ...Object.values(SIGNED_DOCUMENT_EMAIL_JOB_NAMES),
        ],
      },
    );
  });
});
