import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("BillingService contract-account retirement", () => {
  it("removes the retired contract-account, invoice, attachment, and legacy credit-note surfaces", () => {
    const source = readFileSync(join(__dirname, "billing.service.ts"), "utf8");

    for (const method of [
      "getContractAccount",
      "listBillingContracts",
      "getInvoicePdfUrl",
      "getReceiptPdfUrl",
      "getCreditNotePdfUrl",
      "sendCreditNoteEmail",
      "sendContractAccountStatementEmail",
      "getPaymentAttachment",
    ]) {
      expect(source).not.toContain(`async ${method}(`);
    }
  });

  it("keeps verification and receipt-worker runtime behavior", () => {
    const source = readFileSync(join(__dirname, "billing.service.ts"), "utf8");

    expect(source).toContain("async verifyPayment(");
    expect(source).toContain("async rejectPayment(");
    expect(source).toContain("async processVerifiedPaymentReceiptJob(");
    expect(source).toContain("async approveAndSendReceipt(");
  });
});
