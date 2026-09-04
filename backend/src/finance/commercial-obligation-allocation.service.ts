import { Injectable } from "@nestjs/common";
import {
  CommercialObligation,
  CommercialObligationAllocation,
  CommercialObligationStatus,
  Payment,
  PaymentAllocationStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import {
  FINANCE_AUDIT_ACTIONS,
  FINANCE_AUDIT_ENTITY_TYPES,
  financeAuditRecord,
  financeMoney,
  type FinanceActor,
} from "./finance-audit";

const MAX_AMOUNT = new Prisma.Decimal("99999999999999.99999");

export const COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS = {
  INVALID: "COMMERCIAL_OBLIGATION_ALLOCATION_INVALID",
  PAYMENT_INVALID: "COMMERCIAL_OBLIGATION_ALLOCATION_PAYMENT_INVALID",
  OBLIGATION_INVALID: "COMMERCIAL_OBLIGATION_ALLOCATION_OBLIGATION_INVALID",
  CURRENCY_MISMATCH: "COMMERCIAL_OBLIGATION_ALLOCATION_CURRENCY_MISMATCH",
  CUSTOMER_MISMATCH: "COMMERCIAL_OBLIGATION_ALLOCATION_CUSTOMER_MISMATCH",
  PAYMENT_INSUFFICIENT: "COMMERCIAL_OBLIGATION_ALLOCATION_PAYMENT_INSUFFICIENT",
  OBLIGATION_INSUFFICIENT: "COMMERCIAL_OBLIGATION_ALLOCATION_OBLIGATION_INSUFFICIENT",
  CONFLICT: "COMMERCIAL_OBLIGATION_ALLOCATION_CONFLICT",
} as const;

export class CommercialObligationAllocationError extends Error {
  constructor(
    readonly code:
      (typeof COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS)[keyof typeof COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS],
  ) {
    super(code);
  }
}

export interface CommercialObligationAllocationCommand {
  tenantId: string;
  paymentId: string;
  commercialObligationId: string;
  amount: Prisma.Decimal;
  allocationDeduplicationKey: string;
  actor: FinanceActor;
}

interface NormalizedCommand extends CommercialObligationAllocationCommand {
  actor: FinanceActor;
}

@Injectable()
export class CommercialObligationAllocationService {
  /**
   * Applies one commercial-obligation allocation inside a caller-owned transaction.
   * The caller must not open another transaction around this method.
   */
  async allocateInTransaction(
    tx: Prisma.TransactionClient,
    command: CommercialObligationAllocationCommand,
  ): Promise<{ allocation: CommercialObligationAllocation; applied: boolean }> {
    const input = normalize(command);

    await lockPayment(tx, input.tenantId, input.paymentId);
    const payment = await tx.payment.findFirst({
      where: { id: input.paymentId, tenantId: input.tenantId },
    });
    if (!payment) fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.PAYMENT_INVALID);

    await lockObligation(tx, input.tenantId, input.commercialObligationId);
    const obligation = await tx.commercialObligation.findFirst({
      where: { id: input.commercialObligationId, tenantId: input.tenantId },
    });
    if (!obligation) fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.OBLIGATION_INVALID);

    const existing = await lockedAllocationByKey(tx, input);
    if (existing) {
      if (!isExactWinner(existing, input)) {
        fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.CONFLICT);
      }
      return { allocation: existing, applied: false };
    }

    validatePayment(payment);
    validateObligation(obligation);
    if (payment.currencyCode !== obligation.currencyCode) {
      fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.CURRENCY_MISMATCH);
    }
    if (!payment.customerId || payment.customerId !== obligation.customerId) {
      fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.CUSTOMER_MISMATCH);
    }
    if (input.amount.greaterThan(payment.availableAmount)) {
      fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.PAYMENT_INSUFFICIENT);
    }
    if (input.amount.greaterThan(obligation.outstandingAmount)) {
      fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.OBLIGATION_INSUFFICIENT);
    }

    const now = new Date();
    await tx.commercialObligationAllocation.createMany({
      data: [{
        tenantId: input.tenantId,
        commercialObligationId: obligation.id,
        paymentId: payment.id,
        allocationDeduplicationKey: input.allocationDeduplicationKey,
        amount: input.amount,
        status: PaymentAllocationStatus.ACTIVE,
        allocatedAt: now,
      }],
      skipDuplicates: true,
    });

    const persisted = await lockedAllocationByKey(tx, input);
    if (!persisted || !isExactWinner(persisted, input)) {
      fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.CONFLICT);
    }
    if (persisted.status !== PaymentAllocationStatus.ACTIVE) {
      fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.CONFLICT);
    }

    const availableAmount = payment.availableAmount.minus(input.amount);
    const outstandingAmount = obligation.outstandingAmount.minus(input.amount);
    if (availableAmount.isNegative() || outstandingAmount.isNegative()) {
      fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.CONFLICT);
    }
    const obligationStatus = outstandingAmount.isZero()
      ? CommercialObligationStatus.SETTLED
      : CommercialObligationStatus.PARTIALLY_SETTLED;

    await tx.billingAuditLog.createMany({
      data: [
        financeAuditRecord({
          tenantId: input.tenantId,
          entityType: FINANCE_AUDIT_ENTITY_TYPES.COMMERCIAL_OBLIGATION_ALLOCATION,
          entityId: persisted.id,
          action: FINANCE_AUDIT_ACTIONS.APPLIED,
          actor: input.actor,
          occurredAt: now,
          beforeJson: {
            paymentId: payment.id,
            commercialObligationId: obligation.id,
            paymentAvailableAmount: financeMoney(payment.availableAmount),
            commercialObligationOutstandingAmount: financeMoney(obligation.outstandingAmount),
          },
          afterJson: {
            paymentId: payment.id,
            commercialObligationId: obligation.id,
            amount: financeMoney(input.amount),
            paymentAvailableAmount: financeMoney(availableAmount),
            commercialObligationOutstandingAmount: financeMoney(outstandingAmount),
            commercialObligationStatus: obligationStatus,
          },
        }),
        financeAuditRecord({
          tenantId: input.tenantId,
          entityType: FINANCE_AUDIT_ENTITY_TYPES.COMMERCIAL_OBLIGATION,
          entityId: obligation.id,
          action: FINANCE_AUDIT_ACTIONS.APPLIED,
          actor: input.actor,
          occurredAt: now,
          beforeJson: {
            status: obligation.status,
            outstandingAmount: financeMoney(obligation.outstandingAmount),
          },
          afterJson: {
            status: obligationStatus,
            outstandingAmount: financeMoney(outstandingAmount),
            settledAt: outstandingAmount.isZero() ? now.toISOString() : null,
          },
        }),
      ],
    });

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        availableAmount,
        status: availableAmount.isZero()
          ? PaymentStatus.FULLY_ALLOCATED
          : PaymentStatus.PARTIALLY_ALLOCATED,
      },
    });
    await tx.commercialObligation.update({
      where: { id: obligation.id },
      data: {
        outstandingAmount,
        status: obligationStatus,
        settledAt: outstandingAmount.isZero() ? now : null,
      },
    });

    return { allocation: persisted, applied: true };
  }
}

async function lockPayment(
  tx: Prisma.TransactionClient,
  tenantId: string,
  paymentId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "payments"
    WHERE "tenantId" = ${tenantId} AND "id" = ${paymentId}
    FOR UPDATE
  `;
  if (rows.length !== 1) fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.PAYMENT_INVALID);
}

async function lockObligation(
  tx: Prisma.TransactionClient,
  tenantId: string,
  commercialObligationId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "commercial_obligations"
    WHERE "tenantId" = ${tenantId} AND "id" = ${commercialObligationId}
    FOR UPDATE
  `;
  if (rows.length !== 1) fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.OBLIGATION_INVALID);
}

async function lockedAllocationByKey(
  tx: Prisma.TransactionClient,
  input: NormalizedCommand,
): Promise<CommercialObligationAllocation | null> {
  await tx.$queryRaw`
    SELECT "id" FROM "commercial_obligation_allocations"
    WHERE "tenantId" = ${input.tenantId}
      AND "allocationDeduplicationKey" = ${input.allocationDeduplicationKey}
    FOR UPDATE
  `;
  return tx.commercialObligationAllocation.findFirst({
    where: {
      tenantId: input.tenantId,
      allocationDeduplicationKey: input.allocationDeduplicationKey,
    },
  });
}

function isExactWinner(
  allocation: CommercialObligationAllocation,
  input: NormalizedCommand,
): boolean {
  return (
    allocation.tenantId === input.tenantId &&
    allocation.paymentId === input.paymentId &&
    allocation.commercialObligationId === input.commercialObligationId &&
    allocation.allocationDeduplicationKey === input.allocationDeduplicationKey &&
    allocation.amount.equals(input.amount) &&
    allocation.status === PaymentAllocationStatus.ACTIVE
  );
}

function validatePayment(payment: Payment): void {
  if (
    (payment.status !== PaymentStatus.RECEIVED &&
      payment.status !== PaymentStatus.PARTIALLY_ALLOCATED) ||
    !validPositiveAmount(payment.receivedAmount) ||
    !validNonNegativeAmount(payment.availableAmount) ||
    payment.availableAmount.greaterThan(payment.receivedAmount)
  ) {
    fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.PAYMENT_INVALID);
  }
}

function validateObligation(obligation: CommercialObligation): void {
  if (
    obligation.status === CommercialObligationStatus.CANCELLED ||
    obligation.status === CommercialObligationStatus.SETTLED ||
    !validPositiveAmount(obligation.originalAmount) ||
    !validPositiveAmount(obligation.outstandingAmount) ||
    obligation.outstandingAmount.greaterThan(obligation.originalAmount)
  ) {
    fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.OBLIGATION_INVALID);
  }
}

function normalize(command: CommercialObligationAllocationCommand): NormalizedCommand {
  return {
    tenantId: required(command.tenantId, 191),
    paymentId: required(command.paymentId, 191),
    commercialObligationId: required(command.commercialObligationId, 191),
    allocationDeduplicationKey: required(command.allocationDeduplicationKey, 200),
    amount: exactPositiveAmount(command.amount),
    actor: {
      userId: required(command.actor?.userId, 191),
      name: required(command.actor?.name, 500),
    },
  };
}

function exactPositiveAmount(value: unknown): Prisma.Decimal {
  if (!validPositiveAmount(value)) fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.INVALID);
  return value;
}

function validPositiveAmount(value: unknown): value is Prisma.Decimal {
  return validNonNegativeAmount(value) && !value.isZero();
}

function validNonNegativeAmount(value: unknown): value is Prisma.Decimal {
  return (
    value instanceof Prisma.Decimal &&
    value.isFinite() &&
    !value.isNegative() &&
    value.decimalPlaces() <= 5 &&
    value.lessThanOrEqualTo(MAX_AMOUNT)
  );
}

function required(value: unknown, maximum: number): string {
  if (typeof value !== "string") fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.INVALID);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    fail(COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.INVALID);
  }
  return normalized;
}

function fail(
  code:
    (typeof COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS)[keyof typeof COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS],
): never {
  throw new CommercialObligationAllocationError(code);
}
