import { Prisma } from "@prisma/client";

export const FINANCE_AUDIT_ENTITY_TYPES = {
  PAYMENT: "FINANCE_PAYMENT",
  ALLOCATION: "FINANCE_PAYMENT_ALLOCATION",
  REVERSAL: "FINANCE_PAYMENT_ALLOCATION_REVERSAL",
  COMMERCIAL_OBLIGATION: "FINANCE_COMMERCIAL_OBLIGATION",
  COMMERCIAL_OBLIGATION_ALLOCATION: "FINANCE_COMMERCIAL_OBLIGATION_ALLOCATION",
} as const;

export const FINANCE_AUDIT_ACTIONS = {
  REGISTERED: "REGISTERED",
  RESERVATION_SUBMITTED: "RESERVATION_SUBMITTED",
  RESERVATION_APPROVED: "RESERVATION_APPROVED",
  RESERVATION_REJECTED: "RESERVATION_REJECTED",
  CONTRACT_PAYMENT_SUBMITTED: "CONTRACT_PAYMENT_SUBMITTED",
  CONTRACT_PAYMENT_APPROVED: "CONTRACT_PAYMENT_APPROVED",
  CONTRACT_PAYMENT_REJECTED: "CONTRACT_PAYMENT_REJECTED",
  APPLIED: "APPLIED",
  REVERSED: "REVERSED",
  CANCELLED: "CANCELLED",
  RECEIPT_SENT: "RECEIPT_SENT",
  CREATED: "CREATED",
} as const;

export interface FinanceActor {
  userId: string;
  name: string;
}

export function financeAuditRecord(input: {
  tenantId: string;
  entityType: string;
  entityId: string;
  action: string;
  actor: FinanceActor;
  occurredAt: Date;
  beforeJson?: Prisma.InputJsonValue;
  afterJson?: Prisma.InputJsonValue;
}): Prisma.BillingAuditLogCreateManyInput {
  return {
    tenantId: input.tenantId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actorUserId: input.actor.userId,
    actorName: input.actor.name,
    beforeJson: input.beforeJson,
    afterJson: input.afterJson,
    createdAt: input.occurredAt,
  };
}

export function financeMoney(value: Prisma.Decimal): string {
  return value.toFixed();
}
