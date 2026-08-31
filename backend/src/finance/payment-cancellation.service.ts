import { Injectable } from "@nestjs/common";
import { Payment, PaymentAllocationStatus, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const MAX_AMOUNT = new Prisma.Decimal("99999999999999.99999");

export const PAYMENT_CANCELLATION_ERRORS = {
  INVALID: "PAYMENT_CANCELLATION_INVALID",
  PAYMENT_INVALID: "PAYMENT_CANCELLATION_PAYMENT_INVALID",
  NOT_ELIGIBLE: "PAYMENT_CANCELLATION_NOT_ELIGIBLE",
  PERSISTENCE_FAILED: "PAYMENT_CANCELLATION_PERSISTENCE_FAILED",
} as const;

export interface PaymentCancellationCommand {
  tenantId: string;
  paymentId: string;
}

class PaymentCancellationError extends Error {
  constructor(readonly code: (typeof PAYMENT_CANCELLATION_ERRORS)[keyof typeof PAYMENT_CANCELLATION_ERRORS]) {
    super(code);
  }
}

@Injectable()
export class PaymentCancellationService {
  constructor(private readonly prisma: PrismaService) {}

  async cancel(command: PaymentCancellationCommand): Promise<Payment> {
    const input = normalize(command);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const paymentLock = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "payments"
          WHERE "tenantId" = ${input.tenantId} AND "id" = ${input.paymentId}
          FOR UPDATE
        `;
        if (paymentLock.length !== 1) fail(PAYMENT_CANCELLATION_ERRORS.PAYMENT_INVALID);
        const payment = await tx.payment.findFirst({
          where: { id: input.paymentId, tenantId: input.tenantId },
        });
        if (!payment) fail(PAYMENT_CANCELLATION_ERRORS.PAYMENT_INVALID);

        await tx.$queryRaw`
          SELECT "id" FROM "payment_allocations"
          WHERE "tenantId" = ${input.tenantId} AND "paymentId" = ${input.paymentId}
          ORDER BY "id" ASC
          FOR UPDATE
        `;
        const allocations = await tx.paymentAllocation.findMany({
          where: { tenantId: input.tenantId, paymentId: input.paymentId },
          orderBy: { id: "asc" },
          select: { id: true, status: true },
        });

        if (payment.status === PaymentStatus.CANCELLED) {
          if (!validInstant(payment.cancelledAt)) fail(PAYMENT_CANCELLATION_ERRORS.PAYMENT_INVALID);
          return payment;
        }
        if (
          payment.status !== PaymentStatus.RECEIVED || payment.cancelledAt !== null ||
          !validPositiveAmount(payment.receivedAmount) || !validNonNegativeAmount(payment.availableAmount) ||
          !payment.availableAmount.equals(payment.receivedAmount) ||
          allocations.some((allocation) => allocation.status === PaymentAllocationStatus.ACTIVE)
        ) {
          fail(PAYMENT_CANCELLATION_ERRORS.NOT_ELIGIBLE);
        }

        const cancelledAt = new Date();
        const update = await tx.payment.updateMany({
          where: {
            id: input.paymentId,
            tenantId: input.tenantId,
            status: PaymentStatus.RECEIVED,
            cancelledAt: null,
          },
          data: { status: PaymentStatus.CANCELLED, cancelledAt },
        });
        if (update.count !== 1) {
          const winner = await tx.payment.findFirst({
            where: { id: input.paymentId, tenantId: input.tenantId },
          });
          if (winner?.status === PaymentStatus.CANCELLED && validInstant(winner.cancelledAt)) return winner;
          fail(PAYMENT_CANCELLATION_ERRORS.PERSISTENCE_FAILED);
        }
        return { ...payment, status: PaymentStatus.CANCELLED, cancelledAt };
      });
    } catch (error) {
      if (error instanceof PaymentCancellationError) throw error;
      throw new PaymentCancellationError(PAYMENT_CANCELLATION_ERRORS.PERSISTENCE_FAILED);
    }
  }
}

function normalize(command: PaymentCancellationCommand): { tenantId: string; paymentId: string } {
  return { tenantId: required(command.tenantId, 191), paymentId: required(command.paymentId, 191) };
}

function validPositiveAmount(value: unknown): value is Prisma.Decimal {
  return validNonNegativeAmount(value) && !value.isZero();
}

function validNonNegativeAmount(value: unknown): value is Prisma.Decimal {
  return value instanceof Prisma.Decimal && value.isFinite() && !value.isNegative() &&
    value.decimalPlaces() <= 5 && value.lessThanOrEqualTo(MAX_AMOUNT);
}

function validInstant(value: unknown): value is Date {
  return value instanceof Date && value.getTime() === value.getTime();
}

function required(value: unknown, maximum: number): string {
  if (typeof value !== "string") fail(PAYMENT_CANCELLATION_ERRORS.INVALID);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) fail(PAYMENT_CANCELLATION_ERRORS.INVALID);
  return normalized;
}

function fail(code: (typeof PAYMENT_CANCELLATION_ERRORS)[keyof typeof PAYMENT_CANCELLATION_ERRORS]): never {
  throw new PaymentCancellationError(code);
}
