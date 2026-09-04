import { Injectable } from "@nestjs/common";
import {
  CommercialObligation,
  CommercialObligationStatus,
  Currency,
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

export const COMMERCIAL_OBLIGATION_ERRORS = {
  INVALID: "COMMERCIAL_OBLIGATION_INVALID",
  CUSTOMER_INVALID: "COMMERCIAL_OBLIGATION_CUSTOMER_INVALID",
  CONFLICT: "COMMERCIAL_OBLIGATION_CONFLICT",
  PERSISTENCE_FAILED: "COMMERCIAL_OBLIGATION_PERSISTENCE_FAILED",
} as const;

export class CommercialObligationError extends Error {
  constructor(
    readonly code:
      (typeof COMMERCIAL_OBLIGATION_ERRORS)[keyof typeof COMMERCIAL_OBLIGATION_ERRORS],
  ) {
    super(code);
  }
}

export interface CreateCommercialObligationCommand {
  tenantId: string;
  customerId: string;
  sourceType: string;
  sourceId: string;
  sourceReference?: string | null;
  currencyCode: string;
  originalAmount: Prisma.Decimal;
  dueDate?: Date | null;
  actor: FinanceActor;
}

interface NormalizedCommercialObligation {
  tenantId: string;
  customerId: string;
  sourceType: string;
  sourceId: string;
  sourceReference: string | null;
  currencyCode: Currency;
  originalAmount: Prisma.Decimal;
  dueDate: Date | null;
  actor: FinanceActor;
}

@Injectable()
export class CommercialObligationService {
  async createInTransaction(
    tx: Prisma.TransactionClient,
    command: CreateCommercialObligationCommand,
  ): Promise<{ obligation: CommercialObligation; created: boolean }> {
    const input = normalize(command);
    const existing = await findBySource(tx, input);
    if (existing) return exactWinner(existing, input);

    const customer = await tx.client.findFirst({
      where: { id: input.customerId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!customer) {
      throw new CommercialObligationError(
        COMMERCIAL_OBLIGATION_ERRORS.CUSTOMER_INVALID,
      );
    }

    const now = new Date();
    const zeroAmount = input.originalAmount.isZero();
    const inserted = await tx.commercialObligation.createMany({
      data: {
        tenantId: input.tenantId,
        customerId: input.customerId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceReference: input.sourceReference,
        currencyCode: input.currencyCode,
        originalAmount: input.originalAmount,
        outstandingAmount: input.originalAmount,
        dueDate: input.dueDate,
        status: zeroAmount
          ? CommercialObligationStatus.SETTLED
          : CommercialObligationStatus.OPEN,
        settledAt: zeroAmount ? now : null,
        cancelledAt: null,
      },
      skipDuplicates: true,
    });
    const winner = await findBySource(tx, input);
    if (!winner) {
      throw new CommercialObligationError(
        COMMERCIAL_OBLIGATION_ERRORS.PERSISTENCE_FAILED,
      );
    }
    const result = exactWinner(winner, input);
    if (inserted.count === 1) {
      await tx.billingAuditLog.create({
        data: financeAuditRecord({
          tenantId: input.tenantId,
          entityType: FINANCE_AUDIT_ENTITY_TYPES.COMMERCIAL_OBLIGATION,
          entityId: winner.id,
          action: FINANCE_AUDIT_ACTIONS.CREATED,
          actor: input.actor,
          occurredAt: winner.createdAt,
          afterJson: {
            customerId: winner.customerId,
            sourceType: winner.sourceType,
            sourceId: winner.sourceId,
            sourceReference: winner.sourceReference,
            currencyCode: winner.currencyCode,
            originalAmount: financeMoney(winner.originalAmount),
            outstandingAmount: financeMoney(winner.outstandingAmount),
            dueDate: winner.dueDate?.toISOString().slice(0, 10) ?? null,
            status: winner.status,
          },
        }),
      });
    }
    return { ...result, created: inserted.count === 1 };
  }
}

function findBySource(
  tx: Prisma.TransactionClient,
  input: Pick<NormalizedCommercialObligation, "tenantId" | "sourceType" | "sourceId">,
): Promise<CommercialObligation | null> {
  return tx.commercialObligation.findUnique({
    where: {
      tenantId_sourceType_sourceId: {
        tenantId: input.tenantId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    },
  });
}

function exactWinner(
  winner: CommercialObligation,
  input: NormalizedCommercialObligation,
): { obligation: CommercialObligation; created: false } {
  if (
    winner.tenantId !== input.tenantId ||
    winner.customerId !== input.customerId ||
    winner.sourceType !== input.sourceType ||
    winner.sourceId !== input.sourceId ||
    winner.sourceReference !== input.sourceReference ||
    winner.currencyCode !== input.currencyCode ||
    !winner.originalAmount.equals(input.originalAmount) ||
    !sameNullableDate(winner.dueDate, input.dueDate)
  ) {
    throw new CommercialObligationError(
      COMMERCIAL_OBLIGATION_ERRORS.CONFLICT,
    );
  }
  return { obligation: winner, created: false };
}

function normalize(
  command: CreateCommercialObligationCommand,
): NormalizedCommercialObligation {
  const currencyCode = required(command.currencyCode, 3).toUpperCase();
  if (currencyCode !== Currency.CRC && currencyCode !== Currency.USD) invalid();
  const originalAmount = command.originalAmount;
  if (
    !(originalAmount instanceof Prisma.Decimal) ||
    !originalAmount.isFinite() ||
    originalAmount.isNegative() ||
    originalAmount.decimalPlaces() > 5 ||
    originalAmount.greaterThan(MAX_AMOUNT)
  ) {
    invalid();
  }
  return {
    tenantId: required(command.tenantId, 191),
    customerId: required(command.customerId, 191),
    sourceType: required(command.sourceType, 100),
    sourceId: required(command.sourceId, 100),
    sourceReference: optional(command.sourceReference, 100),
    currencyCode: currencyCode as Currency,
    originalAmount,
    dueDate: nullableDate(command.dueDate),
    actor: {
      userId: required(command.actor?.userId, 191),
      name: required(command.actor?.name, 500),
    },
  };
}

function required(value: unknown, maximum: number): string {
  const normalized = optional(value, maximum);
  if (normalized === null) invalid();
  return normalized;
}

function optional(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") invalid();
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) invalid();
  return normalized;
}

function nullableDate(value: unknown): Date | null {
  if (value === undefined || value === null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) invalid();
  return new Date(value.getTime());
}

function sameNullableDate(left: Date | null, right: Date | null): boolean {
  return left === null
    ? right === null
    : right !== null && left.getTime() === right.getTime();
}

function invalid(): never {
  throw new CommercialObligationError(COMMERCIAL_OBLIGATION_ERRORS.INVALID);
}
