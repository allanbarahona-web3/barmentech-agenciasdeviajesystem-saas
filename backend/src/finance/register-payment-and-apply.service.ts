import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { FinanceActor } from "./finance-audit";
import { applyLockedPaymentAllocations } from "./payment-allocation.service";
import { PaymentRegistrationService, type PaymentRegistrationCommand, PAYMENT_REGISTRATION_ERRORS } from "./payment-registration.service";

export type RegisterPaymentAndApplyCommand = PaymentRegistrationCommand & { accountReceivableId: string };

@Injectable()
export class RegisterPaymentAndApplyService {
  constructor(private readonly prisma: PrismaService, private readonly registrations: PaymentRegistrationService) {}

  async execute(command: RegisterPaymentAndApplyCommand) {
    return this.prisma.$transaction(async (tx) => {
      const registered = await this.registrations.registerInTransaction(tx, command);
      const paymentLocks = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "payments" WHERE "id"=${registered.payment.id} AND "tenantId"=${command.tenantId} FOR UPDATE`;
      if (paymentLocks.length !== 1) throw new Error(PAYMENT_REGISTRATION_ERRORS.PERSISTENCE_FAILED);
      const arLocks = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "account_receivables" WHERE "id"=${command.accountReceivableId} AND "tenantId"=${command.tenantId} FOR UPDATE`;
      if (arLocks.length !== 1) throw new Error("PAYMENT_ALLOCATION_RECEIVABLE_INVALID");
      const [payment, accountReceivable] = await Promise.all([
        tx.payment.findFirst({ where: { id: registered.payment.id, tenantId: command.tenantId } }),
        tx.accountReceivable.findFirst({ where: { id: command.accountReceivableId, tenantId: command.tenantId } }),
      ]);
      if (!payment) throw new Error(PAYMENT_REGISTRATION_ERRORS.PERSISTENCE_FAILED);
      if (!accountReceivable) throw new Error("PAYMENT_ALLOCATION_RECEIVABLE_INVALID");
      const existing = registered.created ? null : await tx.paymentAllocation.findFirst({ where: { tenantId: command.tenantId, allocationDeduplicationKey: command.registrationDeduplicationKey } });
      if (!registered.created && (!existing || existing.paymentId !== payment.id || existing.accountReceivableId !== accountReceivable.id)) throw new Error(PAYMENT_REGISTRATION_ERRORS.CONFLICT);
      const amount = existing?.amount ?? Prisma.Decimal.min(payment.receivedAmount, accountReceivable.outstandingAmount);
      await applyLockedPaymentAllocations(tx, command.tenantId, command.actor as FinanceActor, [payment], [accountReceivable], [{ paymentId: payment.id, accountReceivableId: accountReceivable.id, amount, allocationDeduplicationKey: command.registrationDeduplicationKey }]);
      const [updatedPayment, updatedAccountReceivable] = await Promise.all([
        tx.payment.findFirst({ where: { id: payment.id, tenantId: command.tenantId } }),
        tx.accountReceivable.findFirst({ where: { id: accountReceivable.id, tenantId: command.tenantId } }),
      ]);
      if (!updatedPayment || !updatedAccountReceivable) throw new Error(PAYMENT_REGISTRATION_ERRORS.PERSISTENCE_FAILED);
      return { payment: { id: updatedPayment.id, receiptNumber: updatedPayment.receiptNumber, receivedAmount: updatedPayment.receivedAmount.toFixed(), availableAmount: updatedPayment.availableAmount.toFixed(), status: updatedPayment.status }, allocation: { accountReceivableId: updatedAccountReceivable.id, sourceNumber: updatedAccountReceivable.sourceNumber, amount: amount.toFixed(), outstandingAmount: updatedAccountReceivable.outstandingAmount.toFixed(), status: updatedAccountReceivable.status } };
    });
  }
}
