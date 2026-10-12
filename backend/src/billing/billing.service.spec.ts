import { BillingService } from "./billing.service";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("BillingService autoIssueAndSendInvoiceToTitular", () => {
  it("does not recreate a legacy invoice when the contract reservation is managed by Finance", async () => {
    const billingInvoice = { findUnique: jest.fn() };
    const prisma = {
      contract: {
        findUnique: jest.fn().mockResolvedValue({
          id: "contract-1", tenantId: "tenant-1", status: "SIGNED", billingInvoice: null,
        }),
      },
      payment: { findFirst: jest.fn().mockResolvedValue({ id: "payment-1" }) },
      billingInvoice,
    };
    const service = new BillingService(
      prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    );

    await expect(service.autoIssueAndSendInvoiceToTitular({
      contractId: "contract-1", actorUserId: "agent-1", actorEmail: "agent@example.com", actorName: "Agent",
    })).resolves.toMatchObject({ skipped: true, paymentId: "payment-1" });

    expect(prisma.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ contractId: "contract-1", purpose: "CONTRACT_RESERVATION" }),
    }));
    expect(billingInvoice.findUnique).not.toHaveBeenCalled();
  });
});

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
