import { Logger } from "@nestjs/common";

type TenantTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type InteractiveDatabase<TTransaction extends TenantTransaction> = {
  $transaction<T>(work: (transaction: TTransaction) => Promise<T>): Promise<T>;
};

export async function runCostEngineTenantTransaction<TTransaction extends TenantTransaction, TResult>(
  database: InteractiveDatabase<TTransaction>,
  logger: Pick<Logger, "warn">,
  tenantId: string,
  operation: string,
  work: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  const startedAt = Date.now();
  try {
    return await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return work(transaction);
    });
  } catch (error) {
    logTransactionTimeout(logger, tenantId, operation, startedAt, error);
    throw error;
  }
}

export function logTransactionTimeout(
  logger: Pick<Logger, "warn">,
  tenantId: string,
  operation: string,
  startedAt: number,
  error: unknown,
): void {
  const errorCode = transactionErrorCode(error);
  if (!isTransactionTimeout(errorCode, error)) return;

  logger.warn(JSON.stringify({
    event: "cost_engine_interactive_transaction_timeout",
    context: "cost-engine",
    operation,
    tenantId,
    elapsedMs: Math.max(0, Date.now() - startedAt),
    errorCode: errorCode ?? "UNKNOWN",
  }));
}

function transactionErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^[A-Z]\d{4}$/.test(code) ? code : null;
}

function isTransactionTimeout(errorCode: string | null, error: unknown): boolean {
  if (errorCode === "P2028") return true;
  const message = error instanceof Error ? error.message : "";
  return /(?:interactive )?transaction.*(?:timeout|timed out|expired|closed)/i.test(message);
}
