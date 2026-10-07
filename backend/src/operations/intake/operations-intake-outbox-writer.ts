import { Prisma } from "@prisma/client";

export type OperationsIntakeOutboxEventInput = {
  tenantId: string;
  scopeType?: "TRAVEL_PACKAGE" | "STANDALONE_CUSTOMER";
  travelPackageId: string | null;
  customerId?: string | null;
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
  // Prisma Client generation follows the manual migration application; keep the
  // source-neutral input at this boundary until the generated client is refreshed.
  return tx.operationsIntakeOutboxEvent.createMany({ data: [...events] as any, skipDuplicates: true });
}
