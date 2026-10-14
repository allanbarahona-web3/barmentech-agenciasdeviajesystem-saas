import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("BillingService legacy credit-note retirement", () => {
  it("keeps historical PDF reads while removing legacy NC writers", () => {
    const source = readFileSync(join(__dirname, "billing.service.ts"), "utf8");

    expect(source).toContain("async getCreditNotePdfUrl(");
    expect(source).toContain("async sendCreditNoteEmail(");
    expect(source).toContain("billingClientBalance.findUnique");
    expect(source).not.toContain("billingCreditNote.create");
    expect(source).not.toContain("billingClientBalance.upsert");
    expect(source).not.toContain('status: "NC_PENDIENTE_APROBACION"');
  });
});

describe("BillingService legacy bootstrap retirement", () => {
  it("removes the orphan bootstrap and auto-issue paths without changing temporary payment or receipt flows", () => {
    const serviceSource = readFileSync(join(__dirname, "billing.service.ts"), "utf8");
    const emailJobSource = readFileSync(
      join(__dirname, "..", "email", "jobs", "billing-financial-email-job.constants.ts"),
      "utf8",
    );
    const emailTemplateSource = readFileSync(
      join(__dirname, "..", "email", "interfaces", "email-options.interface.ts"),
      "utf8",
    );

    expect(serviceSource).not.toContain("autoIssueAndSendInvoiceToTitular");
    expect(serviceSource).not.toContain("bootstrapContractBilling");
    expect(emailJobSource).not.toContain("AUTOMATIC_INITIAL_INVOICE");
    expect(emailTemplateSource).not.toContain("invoice-initial");

    expect(serviceSource).not.toContain("async reportPayment(");
    expect(serviceSource).not.toContain("async markPaymentInReview(");
    expect(serviceSource).toContain("async verifyPayment(");
    expect(serviceSource).toContain("async rejectPayment(");
    expect(serviceSource).toContain("async processVerifiedPaymentReceiptJob(");
  });
});

describe("BillingService legacy dashboard retirement", () => {
  it("removes the obsolete unscoped dashboard aggregate without affecting historical billing reads", () => {
    const serviceSource = readFileSync(join(__dirname, "billing.service.ts"), "utf8");

    expect(serviceSource).not.toContain("async getDashboardMetrics(");
    expect(serviceSource).toContain("async getContractAccount(");
    expect(serviceSource).toContain("async getCreditNotePdfUrl(");
  });
});
