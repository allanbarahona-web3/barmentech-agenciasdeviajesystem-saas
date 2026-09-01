import { Prisma } from "@prisma/client";

export const FINANCE_AUDIT_ENTITY_TYPES = {
  PAYMENT: "FINANCE_PAYMENT",
  ALLOCATION: "FINANCE_PAYMENT_ALLOCATION",
  REVERSAL: "FINANCE_PAYMENT_ALLOCATION_REVERSAL",
} as const;

export const FINANCE_AUDIT_ACTIONS = {
  REGISTERED: "REGISTERED",
  APPLIED: "APPLIED",
  REVERSED: "REVERSED",
  CANCELLED: "CANCELLED",
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
