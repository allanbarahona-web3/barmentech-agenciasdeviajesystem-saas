type TenantTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type InteractiveDatabase<TTransaction extends TenantTransaction> = {
  $transaction<T>(work: (transaction: TTransaction) => Promise<T>): Promise<T>;
};

/** Runs a tenant-owned operation with the RLS context scoped to the same transaction. */
export function runTenantTransaction<TTransaction extends TenantTransaction, TResult>(
  database: InteractiveDatabase<TTransaction>,
  tenantId: string,
  work: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return work(transaction);
  });
}
