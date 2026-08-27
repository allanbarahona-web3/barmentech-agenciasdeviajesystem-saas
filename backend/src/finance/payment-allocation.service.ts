import { Injectable } from "@nestjs/common";
import {
  AccountReceivableStatus,
  PaymentAllocationStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const MAX_ALLOCATION_AMOUNT = new Prisma.Decimal("99999999999999.99999");
const MAX_ALLOCATIONS_PER_COMMAND = 25;

export const PAYMENT_ALLOCATION_ERRORS = {
  INVALID: "PAYMENT_ALLOCATION_INVALID",
  PAYMENT_INVALID: "PAYMENT_ALLOCATION_PAYMENT_INVALID",
  RECEIVABLE_INVALID: "PAYMENT_ALLOCATION_RECEIVABLE_INVALID",
  CURRENCY_MISMATCH: "PAYMENT_ALLOCATION_CURRENCY_MISMATCH",
  PAYMENT_INSUFFICIENT: "PAYMENT_ALLOCATION_PAYMENT_INSUFFICIENT",
  RECEIVABLE_INSUFFICIENT: "PAYMENT_ALLOCATION_RECEIVABLE_INSUFFICIENT",
  CONFLICT: "PAYMENT_ALLOCATION_CONFLICT",
  PERSISTENCE_FAILED: "PAYMENT_ALLOCATION_PERSISTENCE_FAILED",
} as const;

export interface PaymentAllocationCommand {
  tenantId: string;
  paymentId: string;
  allocations: ReadonlyArray<{
    accountReceivableId: string;
    amount: Prisma.Decimal;
    allocationDeduplicationKey: string;
  }>;
}

interface NormalizedAllocation {
  accountReceivableId: string;
  amount: Prisma.Decimal;
  allocationDeduplicationKey: string;
}

class PaymentAllocationError extends Error {
  constructor(readonly code: (typeof PAYMENT_ALLOCATION_ERRORS)[keyof typeof PAYMENT_ALLOCATION_ERRORS]) {
    super(code);
  }
}

@Injectable()
export class PaymentAllocationService {
  constructor(private readonly prisma: PrismaService) {}

  async allocate(command: PaymentAllocationCommand): Promise<void> {
    const input = normalize(command);
    try {
      await this.prisma.$transaction(async (tx) => {
        const paymentLock = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "payments"
          WHERE "id" = ${input.paymentId} AND "tenantId" = ${input.tenantId}
          FOR UPDATE
        `;
        if (paymentLock.length !== 1) fail(PAYMENT_ALLOCATION_ERRORS.PAYMENT_INVALID);
        const payment = await tx.payment.findFirst({
          where: { id: input.paymentId, tenantId: input.tenantId },
        });
        if (!payment || payment.status === PaymentStatus.CANCELLED) {
          fail(PAYMENT_ALLOCATION_ERRORS.PAYMENT_INVALID);
        }
        validateStoredPayment(payment);

        const receivableIds = [...new Set(input.allocations.map((item) => item.accountReceivableId))].sort();
        const receivableLocks = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "account_receivables"
          WHERE "tenantId" = ${input.tenantId} AND "id" IN (${Prisma.join(receivableIds)})
          ORDER BY "id" ASC
          FOR UPDATE
        `;
        if (receivableLocks.length !== receivableIds.length) {
          fail(PAYMENT_ALLOCATION_ERRORS.RECEIVABLE_INVALID);
        }
        const receivables = await tx.accountReceivable.findMany({
          where: { tenantId: input.tenantId, id: { in: receivableIds } },
        });
        if (receivables.length !== receivableIds.length) {
          fail(PAYMENT_ALLOCATION_ERRORS.RECEIVABLE_INVALID);
        }
        const receivableById = new Map(receivables.map((item) => [item.id, item]));

        const existing = await lockedExistingAllocations(
          tx,
          input.tenantId,
          input.allocations.map((item) => item.allocationDeduplicationKey),
        );
        const existingByKey = new Map(existing.map((item) => [item.allocationDeduplicationKey, item]));
        const newAllocations: NormalizedAllocation[] = [];
        for (const item of input.allocations) {
          const winner = existingByKey.get(item.allocationDeduplicationKey);
          if (winner) {
            if (!isExactAllocationWinner(winner, input.paymentId, item)) {
              fail(PAYMENT_ALLOCATION_ERRORS.CONFLICT);
            }
            continue;
          }
          newAllocations.push(item);
        }
        if (newAllocations.length === 0) return;

        let newTotal = new Prisma.Decimal(0);
        for (const item of newAllocations) {
          const receivable = receivableById.get(item.accountReceivableId);
          if (!receivable || receivable.status === AccountReceivableStatus.CANCELLED) {
            fail(PAYMENT_ALLOCATION_ERRORS.RECEIVABLE_INVALID);
          }
          if (receivable.status === AccountReceivableStatus.SETTLED) {
            fail(PAYMENT_ALLOCATION_ERRORS.RECEIVABLE_INVALID);
          }
          if (receivable.currencyCode !== payment.currencyCode) {
            fail(PAYMENT_ALLOCATION_ERRORS.CURRENCY_MISMATCH);
          }
          validateStoredReceivable(receivable);
          if (item.amount.greaterThan(receivable.outstandingAmount)) {
            fail(PAYMENT_ALLOCATION_ERRORS.RECEIVABLE_INSUFFICIENT);
          }
          newTotal = newTotal.plus(item.amount);
        }
        if (newTotal.greaterThan(payment.availableAmount)) {
          fail(PAYMENT_ALLOCATION_ERRORS.PAYMENT_INSUFFICIENT);
        }
        const newPaymentAvailable = payment.availableAmount.minus(newTotal);
        if (newPaymentAvailable.isNegative()) {
          fail(PAYMENT_ALLOCATION_ERRORS.PAYMENT_INSUFFICIENT);
        }

        const now = new Date();
        await tx.paymentAllocation.createMany({
          data: newAllocations.map((item) => ({
            tenantId: input.tenantId,
            paymentId: input.paymentId,
            accountReceivableId: item.accountReceivableId,
            allocationDeduplicationKey: item.allocationDeduplicationKey,
            amount: item.amount,
            status: PaymentAllocationStatus.ACTIVE,
            allocatedAt: now,
          })),
          skipDuplicates: true,
        });
        const persisted = await lockedExistingAllocations(
          tx,
          input.tenantId,
          newAllocations.map((item) => item.allocationDeduplicationKey),
        );
        if (
          persisted.length !== newAllocations.length ||
          !newAllocations.every((item) => {
            const winner = persisted.find((value) => value.allocationDeduplicationKey === item.allocationDeduplicationKey);
            return winner && isExactAllocationWinner(winner, input.paymentId, item);
          })
        ) {
          fail(PAYMENT_ALLOCATION_ERRORS.CONFLICT);
        }

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            availableAmount: newPaymentAvailable,
            status: newPaymentAvailable.isZero() ? PaymentStatus.FULLY_ALLOCATED : PaymentStatus.PARTIALLY_ALLOCATED,
          },
        });
        for (const item of newAllocations) {
          const receivable = receivableById.get(item.accountReceivableId)!;
          const outstandingAmount = receivable.outstandingAmount.minus(item.amount);
          if (outstandingAmount.isNegative() || outstandingAmount.greaterThan(receivable.originalAmount)) {
            fail(PAYMENT_ALLOCATION_ERRORS.RECEIVABLE_INSUFFICIENT);
          }
          await tx.accountReceivable.update({
            where: { id: receivable.id },
            data: {
              outstandingAmount,
              status: outstandingAmount.isZero() ? AccountReceivableStatus.SETTLED : AccountReceivableStatus.PARTIALLY_SETTLED,
              settledAt: outstandingAmount.isZero() ? now : null,
            },
          });
        }
      });
    } catch (error) {
      if (error instanceof PaymentAllocationError) throw error;
      throw new PaymentAllocationError(PAYMENT_ALLOCATION_ERRORS.PERSISTENCE_FAILED);
    }
  }
}

function normalize(command: PaymentAllocationCommand): { tenantId: string; paymentId: string; allocations: NormalizedAllocation[] } {
  const tenantId = required(command.tenantId, 191);
  const paymentId = required(command.paymentId, 191);
  if (!Array.isArray(command.allocations) || command.allocations.length < 1 || command.allocations.length > MAX_ALLOCATIONS_PER_COMMAND) {
    fail(PAYMENT_ALLOCATION_ERRORS.INVALID);
  }
  const receivableIds = new Set<string>();
  const keys = new Set<string>();
  const allocations = command.allocations.map((item) => {
    if (typeof item !== "object" || item === null) fail(PAYMENT_ALLOCATION_ERRORS.INVALID);
    const accountReceivableId = required(item.accountReceivableId, 191);
    const allocationDeduplicationKey = required(item.allocationDeduplicationKey, 200);
    if (receivableIds.has(accountReceivableId) || keys.has(allocationDeduplicationKey)) {
      fail(PAYMENT_ALLOCATION_ERRORS.INVALID);
    }
    receivableIds.add(accountReceivableId); keys.add(allocationDeduplicationKey);
    return { accountReceivableId, allocationDeduplicationKey, amount: exactAmount(item.amount) };
  });
  return { tenantId, paymentId, allocations };
}

async function lockedExistingAllocations(
  tx: Prisma.TransactionClient,
  tenantId: string,
  keys: ReadonlyArray<string>,
) {
  if (keys.length === 0) return [];
  await tx.$queryRaw`
    SELECT "id" FROM "payment_allocations"
    WHERE "tenantId" = ${tenantId} AND "allocationDeduplicationKey" IN (${Prisma.join(keys)})
    ORDER BY "allocationDeduplicationKey" ASC
    FOR UPDATE
  `;
  return tx.paymentAllocation.findMany({
    where: { tenantId, allocationDeduplicationKey: { in: [...keys] } },
  });
}

function isExactAllocationWinner(
  winner: { paymentId: string; accountReceivableId: string; amount: Prisma.Decimal },
  paymentId: string,
  item: NormalizedAllocation,
): boolean {
  return winner.paymentId === paymentId &&
    winner.accountReceivableId === item.accountReceivableId &&
    winner.amount.equals(item.amount);
}

function validateStoredPayment(payment: { receivedAmount: Prisma.Decimal; availableAmount: Prisma.Decimal }): void {
  if (!validPositiveAmount(payment.receivedAmount) || !validNonNegativeAmount(payment.availableAmount) || payment.availableAmount.greaterThan(payment.receivedAmount)) {
    fail(PAYMENT_ALLOCATION_ERRORS.PAYMENT_INVALID);
  }
}

function validateStoredReceivable(receivable: { originalAmount: Prisma.Decimal; outstandingAmount: Prisma.Decimal }): void {
  if (!validPositiveAmount(receivable.originalAmount) || !validNonNegativeAmount(receivable.outstandingAmount) || receivable.outstandingAmount.greaterThan(receivable.originalAmount)) {
    fail(PAYMENT_ALLOCATION_ERRORS.RECEIVABLE_INVALID);
  }
}

function exactAmount(value: unknown): Prisma.Decimal {
  if (!validPositiveAmount(value)) fail(PAYMENT_ALLOCATION_ERRORS.INVALID);
  return value;
}

function validPositiveAmount(value: unknown): value is Prisma.Decimal {
  return validNonNegativeAmount(value) && !value.isZero();
}

function validNonNegativeAmount(value: unknown): value is Prisma.Decimal {
  return value instanceof Prisma.Decimal && value.isFinite() && !value.isNegative() && value.decimalPlaces() <= 5 && value.lessThanOrEqualTo(MAX_ALLOCATION_AMOUNT);
}

function required(value: unknown, maximum: number): string {
  if (typeof value !== "string") fail(PAYMENT_ALLOCATION_ERRORS.INVALID);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) fail(PAYMENT_ALLOCATION_ERRORS.INVALID);
  return normalized;
}

function fail(code: (typeof PAYMENT_ALLOCATION_ERRORS)[keyof typeof PAYMENT_ALLOCATION_ERRORS]): never {
  throw new PaymentAllocationError(code);
}
