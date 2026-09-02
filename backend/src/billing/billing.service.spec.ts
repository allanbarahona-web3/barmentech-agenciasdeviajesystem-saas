import { BillingService } from "./billing.service";

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
      prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
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
