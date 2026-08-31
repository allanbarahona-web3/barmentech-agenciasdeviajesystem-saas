import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FinanceReadService } from "./finance-read.service";

describe("FinanceReadService", () => {
  it("reads payment detail only within its tenant and preserves exact decimal strings", async () => {
    const prisma = { payment: { findFirst: jest.fn().mockResolvedValue(payment()) } };
    const service = new FinanceReadService(prisma as unknown as PrismaService);

    await expect(service.getPaymentDetail("tenant-a", "payment-a")).resolves.toMatchObject({
      receivedAmount: "10.12345", availableAmount: "6",
      allocations: [{ amount: "4.12345", accountReceivable: { outstandingAmount: "5.87655" } }],
    });
    expect(prisma.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "payment-a", tenantId: "tenant-a" } }));
  });

  it("does not expose a payment outside the authenticated tenant", async () => {
    const prisma = { payment: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new FinanceReadService(prisma as unknown as PrismaService);
    await expect(service.getPaymentDetail("tenant-a", "payment-other")).rejects.toBeInstanceOf(NotFoundException);
  });
});

function payment() {
  return {
    id: "payment-a", customerId: "customer-a", payerDisplayName: "Payer", payerIdentificationType: null, payerIdentificationNumber: null,
    currencyCode: "CRC", receivedAmount: new Prisma.Decimal("10.12345"), availableAmount: new Prisma.Decimal("6.00000"), receivedAt: new Date(), paymentMethod: "CASH", externalReference: null, description: null, status: "PARTIALLY_ALLOCATED", cancelledAt: null,
    allocations: [{ id: "allocation-a", accountReceivableId: "ar-a", amount: new Prisma.Decimal("4.12345"), status: "ACTIVE", allocatedAt: new Date(), reversal: null, accountReceivable: { id: "ar-a", currencyCode: "CRC", originalAmount: new Prisma.Decimal("10"), outstandingAmount: new Prisma.Decimal("5.87655"), status: "PARTIALLY_SETTLED" } }],
  };
}
