import { Injectable } from "@nestjs/common";
import {
  AccountReceivableStatus,
  PaymentAllocationReversal,
  PaymentAllocationStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  FINANCE_AUDIT_ACTIONS,
  FINANCE_AUDIT_ENTITY_TYPES,
  financeAuditRecord,
  financeMoney,
  type FinanceActor,
} from "./finance-audit";

const MAX_AMOUNT = new Prisma.Decimal("99999999999999.99999");

export const PAYMENT_ALLOCATION_REVERSAL_ERRORS = {
  INVALID: "PAYMENT_ALLOCATION_REVERSAL_INVALID",
  ALLOCATION_INVALID: "PAYMENT_ALLOCATION_REVERSAL_ALLOCATION_INVALID",
  PAYMENT_INVALID: "PAYMENT_ALLOCATION_REVERSAL_PAYMENT_INVALID",
  RECEIVABLE_INVALID: "PAYMENT_ALLOCATION_REVERSAL_RECEIVABLE_INVALID",
  CURRENCY_MISMATCH: "PAYMENT_ALLOCATION_REVERSAL_CURRENCY_MISMATCH",
  PAYMENT_CAPACITY: "PAYMENT_ALLOCATION_REVERSAL_PAYMENT_CAPACITY",
  RECEIVABLE_CAPACITY: "PAYMENT_ALLOCATION_REVERSAL_RECEIVABLE_CAPACITY",
  CONFLICT: "PAYMENT_ALLOCATION_REVERSAL_CONFLICT",
  PERSISTENCE_FAILED: "PAYMENT_ALLOCATION_REVERSAL_PERSISTENCE_FAILED",
} as const;

export interface PaymentAllocationReversalCommand {
  tenantId: string;
  actor: FinanceActor;
  paymentAllocationId: string;
  reversalDeduplicationKey: string;
  reason: string;
}

interface NormalizedReversal {
  tenantId: string;
  actor: FinanceActor;
  paymentAllocationId: string;
  reversalDeduplicationKey: string;
  reason: string;
}

class PaymentAllocationReversalError extends Error {
  constructor(readonly code: (typeof PAYMENT_ALLOCATION_REVERSAL_ERRORS)[keyof typeof PAYMENT_ALLOCATION_REVERSAL_ERRORS]) {
    super(code);
  }
}

@Injectable()
export class PaymentAllocationReversalService {
  constructor(private readonly prisma: PrismaService) {}

  async reverse(command: PaymentAllocationReversalCommand): Promise<PaymentAllocationReversal> {
    const input = normalize(command);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const identity = await tx.paymentAllocation.findFirst({
          where: { id: input.paymentAllocationId, tenantId: input.tenantId },
          select: { paymentId: true, accountReceivableId: true },
        });
        if (!identity) fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.ALLOCATION_INVALID);

        const paymentLock = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "payments"
          WHERE "tenantId" = ${input.tenantId} AND "id" = ${identity.paymentId}
          FOR UPDATE
        `;
        if (paymentLock.length !== 1) fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.PAYMENT_INVALID);

        const receivableLock = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "account_receivables"
          WHERE "tenantId" = ${input.tenantId} AND "id" = ${identity.accountReceivableId}
          FOR UPDATE
        `;
        if (receivableLock.length !== 1) fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.RECEIVABLE_INVALID);

        const allocationLock = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "payment_allocations"
          WHERE "tenantId" = ${input.tenantId} AND "id" = ${input.paymentAllocationId}
          FOR UPDATE
        `;
        if (allocationLock.length !== 1) fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.ALLOCATION_INVALID);
        const allocation = await tx.paymentAllocation.findFirst({
          where: { id: input.paymentAllocationId, tenantId: input.tenantId },
        });
        if (
          !allocation ||
          allocation.paymentId !== identity.paymentId ||
          allocation.accountReceivableId !== identity.accountReceivableId
        ) {
          fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.ALLOCATION_INVALID);
        }

        const existing = await lockedReversalWinners(tx, input);
        const exactWinner = resolveWinner(existing, input);
        if (exactWinner) return exactWinner;
        if (allocation.status !== PaymentAllocationStatus.ACTIVE) {
          fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.ALLOCATION_INVALID);
        }
        if (!validPositiveAmount(allocation.amount)) {
          fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.ALLOCATION_INVALID);
        }

        const payment = await tx.payment.findFirst({
          where: { id: identity.paymentId, tenantId: input.tenantId },
        });
        if (!payment || payment.status === PaymentStatus.CANCELLED) {
          fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.PAYMENT_INVALID);
        }
        const receivable = await tx.accountReceivable.findFirst({
          where: { id: identity.accountReceivableId, tenantId: input.tenantId },
        });
        if (!receivable || receivable.status === AccountReceivableStatus.CANCELLED) {
          fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.RECEIVABLE_INVALID);
        }
        if (payment.currencyCode !== receivable.currencyCode) {
          fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.CURRENCY_MISMATCH);
        }
        validatePayment(payment);
        validateReceivable(receivable);

        const restoredPaymentAvailable = payment.availableAmount.plus(allocation.amount);
        if (restoredPaymentAvailable.greaterThan(payment.receivedAmount) || restoredPaymentAvailable.greaterThan(MAX_AMOUNT)) {
          fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.PAYMENT_CAPACITY);
        }
        const restoredReceivableOutstanding = receivable.outstandingAmount.plus(allocation.amount);
        if (restoredReceivableOutstanding.greaterThan(receivable.originalAmount) || restoredReceivableOutstanding.greaterThan(MAX_AMOUNT)) {
          fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.RECEIVABLE_CAPACITY);
        }

        const now = new Date();
        await tx.paymentAllocationReversal.createMany({
          data: [{
            tenantId: input.tenantId,
            paymentAllocationId: input.paymentAllocationId,
            reversalDeduplicationKey: input.reversalDeduplicationKey,
            reason: input.reason,
            reversedAt: now,
          }],
          skipDuplicates: true,
        });
        const persisted = await lockedReversalWinners(tx, input);
        const winner = resolveWinner(persisted, input);
        if (!winner) fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.CONFLICT);

        await tx.billingAuditLog.create({
          data: financeAuditRecord({
            tenantId: input.tenantId,
            entityType: FINANCE_AUDIT_ENTITY_TYPES.REVERSAL,
            entityId: winner.id,
            action: FINANCE_AUDIT_ACTIONS.REVERSED,
            actor: input.actor,
            occurredAt: now,
            beforeJson: {
              paymentAllocationId: allocation.id,
              paymentId: payment.id,
              accountReceivableId: receivable.id,
              amount: financeMoney(allocation.amount),
              paymentAvailableAmount: financeMoney(payment.availableAmount),
              accountReceivableOutstandingAmount: financeMoney(receivable.outstandingAmount),
            },
            afterJson: {
              paymentAllocationId: allocation.id,
              paymentId: payment.id,
              accountReceivableId: receivable.id,
              reason: input.reason,
              paymentAvailableAmount: financeMoney(restoredPaymentAvailable),
              accountReceivableOutstandingAmount: financeMoney(restoredReceivableOutstanding),
            },
          }),
        });

        const allocationUpdate = await tx.paymentAllocation.updateMany({
          where: {
            id: input.paymentAllocationId,
            tenantId: input.tenantId,
            paymentId: identity.paymentId,
            accountReceivableId: identity.accountReceivableId,
            status: PaymentAllocationStatus.ACTIVE,
          },
          data: { status: PaymentAllocationStatus.REVERSED },
        });
        if (allocationUpdate.count !== 1) fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.ALLOCATION_INVALID);

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            availableAmount: restoredPaymentAvailable,
            status: restoredPaymentAvailable.equals(payment.receivedAmount)
              ? PaymentStatus.RECEIVED
              : PaymentStatus.PARTIALLY_ALLOCATED,
          },
        });
        await tx.accountReceivable.update({
          where: { id: receivable.id },
          data: {
            outstandingAmount: restoredReceivableOutstanding,
            status: restoredReceivableOutstanding.equals(receivable.originalAmount)
              ? AccountReceivableStatus.OPEN
              : AccountReceivableStatus.PARTIALLY_SETTLED,
            settledAt: null,
          },
        });
        return winner;
      });
    } catch (error) {
      if (error instanceof PaymentAllocationReversalError) throw error;
      throw new PaymentAllocationReversalError(PAYMENT_ALLOCATION_REVERSAL_ERRORS.PERSISTENCE_FAILED);
    }
  }
}

async function lockedReversalWinners(
  tx: Prisma.TransactionClient,
  input: NormalizedReversal,
): Promise<PaymentAllocationReversal[]> {
  await tx.$queryRaw`
    SELECT "id" FROM "payment_allocation_reversals"
    WHERE "tenantId" = ${input.tenantId}
      AND (
        "reversalDeduplicationKey" = ${input.reversalDeduplicationKey}
        OR "paymentAllocationId" = ${input.paymentAllocationId}
      )
    ORDER BY "reversalDeduplicationKey" ASC
    FOR UPDATE
  `;
  return tx.paymentAllocationReversal.findMany({
    where: {
      tenantId: input.tenantId,
      OR: [
        { reversalDeduplicationKey: input.reversalDeduplicationKey },
        { paymentAllocationId: input.paymentAllocationId },
      ],
    },
  });
}

function resolveWinner(
  winners: ReadonlyArray<PaymentAllocationReversal>,
  input: NormalizedReversal,
): PaymentAllocationReversal | null {
  const byKey = winners.find((item) => item.reversalDeduplicationKey === input.reversalDeduplicationKey);
  const byAllocation = winners.find((item) => item.paymentAllocationId === input.paymentAllocationId);
  if (!byKey && !byAllocation) return null;
  if (
    !byKey || !byAllocation || byKey.id !== byAllocation.id ||
    byKey.paymentAllocationId !== input.paymentAllocationId ||
    byKey.reason !== input.reason
  ) {
    fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.CONFLICT);
  }
  return byKey;
}

function normalize(command: PaymentAllocationReversalCommand): NormalizedReversal {
  return {
    tenantId: required(command.tenantId, 191),
    actor: {
      userId: required(command.actor?.userId, 191),
      name: required(command.actor?.name, 500),
    },
    paymentAllocationId: required(command.paymentAllocationId, 191),
    reversalDeduplicationKey: required(command.reversalDeduplicationKey, 200),
    reason: required(command.reason, 500),
  };
}

function validatePayment(payment: { receivedAmount: Prisma.Decimal; availableAmount: Prisma.Decimal }): void {
  if (
    !validPositiveAmount(payment.receivedAmount) || !validNonNegativeAmount(payment.availableAmount) ||
    payment.availableAmount.greaterThan(payment.receivedAmount)
  ) {
    fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.PAYMENT_INVALID);
  }
}

function validateReceivable(receivable: { originalAmount: Prisma.Decimal; outstandingAmount: Prisma.Decimal }): void {
  if (
    !validPositiveAmount(receivable.originalAmount) || !validNonNegativeAmount(receivable.outstandingAmount) ||
    receivable.outstandingAmount.greaterThan(receivable.originalAmount)
  ) {
    fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.RECEIVABLE_INVALID);
  }
}

function validPositiveAmount(value: unknown): value is Prisma.Decimal {
  return validNonNegativeAmount(value) && !value.isZero();
}

function validNonNegativeAmount(value: unknown): value is Prisma.Decimal {
  return value instanceof Prisma.Decimal && value.isFinite() && !value.isNegative() &&
    value.decimalPlaces() <= 5 && value.lessThanOrEqualTo(MAX_AMOUNT);
}

function required(value: unknown, maximum: number): string {
  if (typeof value !== "string") fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.INVALID);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) fail(PAYMENT_ALLOCATION_REVERSAL_ERRORS.INVALID);
  return normalized;
}

function fail(code: (typeof PAYMENT_ALLOCATION_REVERSAL_ERRORS)[keyof typeof PAYMENT_ALLOCATION_REVERSAL_ERRORS]): never {
  throw new PaymentAllocationReversalError(code);
}
