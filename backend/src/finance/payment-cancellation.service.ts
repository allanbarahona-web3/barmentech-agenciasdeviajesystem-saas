import { Injectable } from "@nestjs/common";
import { Payment, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  FINANCE_AUDIT_ACTIONS,
  FINANCE_AUDIT_ENTITY_TYPES,
  financeAuditRecord,
  financeMoney,
  type FinanceActor,
} from "./finance-audit";
import { canCancelPayment } from "./payment-cancellation-eligibility";

export const PAYMENT_CANCELLATION_ERRORS = {
  INVALID: "PAYMENT_CANCELLATION_INVALID",
  PAYMENT_INVALID: "PAYMENT_CANCELLATION_PAYMENT_INVALID",
  NOT_ELIGIBLE: "PAYMENT_CANCELLATION_NOT_ELIGIBLE",
  PERSISTENCE_FAILED: "PAYMENT_CANCELLATION_PERSISTENCE_FAILED",
} as const;

export interface PaymentCancellationCommand {
  tenantId: string;
  actor: FinanceActor;
  paymentId: string;
  reason: string;
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
        if (!canCancelPayment(payment, allocations)) {
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
        await tx.billingAuditLog.create({
          data: financeAuditRecord({
            tenantId: input.tenantId,
            entityType: FINANCE_AUDIT_ENTITY_TYPES.PAYMENT,
            entityId: payment.id,
            action: FINANCE_AUDIT_ACTIONS.CANCELLED,
            actor: input.actor,
            occurredAt: cancelledAt,
            beforeJson: {
              status: payment.status,
              receivedAmount: financeMoney(payment.receivedAmount),
              availableAmount: financeMoney(payment.availableAmount),
            },
            afterJson: {
              status: PaymentStatus.CANCELLED,
              cancelledAt: cancelledAt.toISOString(),
              reason: input.reason,
              receivedAmount: financeMoney(payment.receivedAmount),
              availableAmount: financeMoney(payment.availableAmount),
            },
          }),
        });
        return { ...payment, status: PaymentStatus.CANCELLED, cancelledAt };
      });
    } catch (error) {
      if (error instanceof PaymentCancellationError) throw error;
      throw new PaymentCancellationError(PAYMENT_CANCELLATION_ERRORS.PERSISTENCE_FAILED);
    }
  }
}

function normalize(command: PaymentCancellationCommand): { tenantId: string; actor: FinanceActor; paymentId: string; reason: string } {
  return {
    tenantId: required(command.tenantId, 191),
    actor: {
      userId: required(command.actor?.userId, 191),
      name: required(command.actor?.name, 500),
    },
    paymentId: required(command.paymentId, 191),
    reason: required(command.reason, 500),
  };
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
