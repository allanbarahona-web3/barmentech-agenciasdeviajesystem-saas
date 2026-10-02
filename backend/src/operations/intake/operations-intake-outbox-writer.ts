import { Prisma } from "@prisma/client";

export type OperationsIntakeOutboxEventInput = {
  tenantId: string;
  travelPackageId: string;
  eventType: string;
  eventVersion: number;
  sourceType: string;
  sourceId: string;
  sourceLineId: string;
  sourceVersionId: string | null;
  availableAt: Date;
};

/** Writes only neutral intake identities; source domains retain source reads. */
export function persistOperationsIntakeOutboxEvents(
  tx: Prisma.TransactionClient,
  events: readonly OperationsIntakeOutboxEventInput[],
): Promise<{ count: number }> {
  if (events.length === 0) return Promise.resolve({ count: 0 });
  return tx.operationsIntakeOutboxEvent.createMany({ data: [...events], skipDuplicates: true });
}
