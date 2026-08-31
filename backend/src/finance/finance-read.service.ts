import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class FinanceReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccountReceivableDetail(tenantId: string, id: string) {
    const receivable = await this.prisma.accountReceivable.findFirst({
      where: { id, tenantId },
      include: {
        paymentAllocations: {
          orderBy: { allocatedAt: "asc" },
          include: { reversal: true },
        },
      },
    });
    if (!receivable) throw new NotFoundException("ACCOUNT_RECEIVABLE_NOT_FOUND");
    return accountReceivableDetail(receivable);
  }

  async getPaymentDetail(tenantId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId },
      include: {
        allocations: {
          orderBy: { allocatedAt: "asc" },
          include: { accountReceivable: true, reversal: true },
        },
      },
    });
    if (!payment) throw new NotFoundException("PAYMENT_NOT_FOUND");
    return paymentDetail(payment);
  }

  async getPaymentIdForAllocation(tenantId: string, id: string): Promise<string> {
    const allocation = await this.prisma.paymentAllocation.findFirst({
      where: { id, tenantId },
      select: { paymentId: true },
    });
    if (!allocation) throw new NotFoundException("PAYMENT_ALLOCATION_NOT_FOUND");
    return allocation.paymentId;
  }

  paymentSummary(payment: {
    id: string; status: string; currencyCode: string; receivedAmount: Prisma.Decimal;
    availableAmount: Prisma.Decimal; receivedAt: Date; cancelledAt: Date | null;
  }) {
    return {
      id: payment.id,
      status: payment.status,
      currencyCode: payment.currencyCode,
      receivedAmount: money(payment.receivedAmount),
      availableAmount: money(payment.availableAmount),
      receivedAt: payment.receivedAt,
      cancelledAt: payment.cancelledAt,
    };
  }
}

function paymentDetail(payment: Prisma.PaymentGetPayload<{
  include: { allocations: { include: { accountReceivable: true; reversal: true } } };
}>) {
  return {
    id: payment.id,
    customerId: payment.customerId,
    payerDisplayName: payment.payerDisplayName,
    payerIdentificationType: payment.payerIdentificationType,
    payerIdentificationNumber: payment.payerIdentificationNumber,
    currencyCode: payment.currencyCode,
    receivedAmount: money(payment.receivedAmount),
    availableAmount: money(payment.availableAmount),
    receivedAt: payment.receivedAt,
    paymentMethod: payment.paymentMethod,
    externalReference: payment.externalReference,
    description: payment.description,
    status: payment.status,
    cancelledAt: payment.cancelledAt,
    allocations: payment.allocations.map((allocation) => ({
      id: allocation.id,
      accountReceivableId: allocation.accountReceivableId,
      amount: money(allocation.amount),
      status: allocation.status,
      allocatedAt: allocation.allocatedAt,
      accountReceivable: {
        id: allocation.accountReceivable.id,
        currencyCode: allocation.accountReceivable.currencyCode,
        originalAmount: money(allocation.accountReceivable.originalAmount),
        outstandingAmount: money(allocation.accountReceivable.outstandingAmount),
        status: allocation.accountReceivable.status,
      },
      reversal: allocation.reversal && {
        id: allocation.reversal.id,
        reason: allocation.reversal.reason,
        reversedAt: allocation.reversal.reversedAt,
      },
    })),
  };
}

function accountReceivableDetail(receivable: Prisma.AccountReceivableGetPayload<{
  include: { paymentAllocations: { include: { reversal: true } } };
}>) {
  return {
    id: receivable.id,
    sourceType: receivable.sourceType,
    sourceId: receivable.sourceId,
    sourceNumber: receivable.sourceNumber,
    sourceDocumentType: receivable.sourceDocumentType,
    customerId: receivable.customerId,
    debtorDisplayName: receivable.debtorDisplayName,
    debtorIdentificationType: receivable.debtorIdentificationType,
    debtorIdentificationNumber: receivable.debtorIdentificationNumber,
    currencyCode: receivable.currencyCode,
    originalAmount: money(receivable.originalAmount),
    outstandingAmount: money(receivable.outstandingAmount),
    dueDate: receivable.dueDate,
    paymentTermDays: receivable.paymentTermDays,
    status: receivable.status,
    recognizedAt: receivable.recognizedAt,
    settledAt: receivable.settledAt,
    cancelledAt: receivable.cancelledAt,
    allocations: receivable.paymentAllocations.map((allocation) => ({
      id: allocation.id,
      paymentId: allocation.paymentId,
      amount: money(allocation.amount),
      status: allocation.status,
      allocatedAt: allocation.allocatedAt,
      reversal: allocation.reversal && {
        id: allocation.reversal.id,
        reason: allocation.reversal.reason,
        reversedAt: allocation.reversal.reversedAt,
      },
    })),
  };
}

function money(value: Prisma.Decimal): string {
  return value.toFixed();
}
