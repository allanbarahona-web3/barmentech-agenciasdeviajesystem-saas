type TenantTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type InteractiveDatabase<TTransaction extends TenantTransaction> = {
  $transaction<T>(work: (transaction: TTransaction) => Promise<T>): Promise<T>;
};

import {
  measureOperationsTimingStage,
  recordOperationsTenantTransaction,
} from "../common/performance/operations-timing";
import { performance } from "node:perf_hooks";

/** Runs a tenant-owned operation with the RLS context scoped to the same transaction. */
export function runTenantTransaction<TTransaction extends TenantTransaction, TResult>(
  database: InteractiveDatabase<TTransaction>,
  tenantId: string,
  work: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  const startedAt = performance.now();
  return database
    .$transaction(async (transaction) => {
      await measureOperationsTimingStage("tenant.set_config", () =>
        transaction.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`,
      );
      return work(transaction);
    })
    .finally(() => recordOperationsTenantTransaction(performance.now() - startedAt));
}
