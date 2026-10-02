import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

type TimingStage = {
  count: number;
  durationMs: number;
};

export type OperationsTimingSnapshot = {
  endpoint: string;
  durationMs: number;
  prisma: { queryCount: number; durationMs: number; slowestQueryMs: number };
  tenantTransaction: TimingStage;
  stages: Record<string, TimingStage>;
};

type OperationsTimingContext = {
  endpoint: string;
  startedAt: number;
  prisma: { queryCount: number; durationMs: number; slowestQueryMs: number };
  tenantTransaction: TimingStage;
  stages: Map<string, TimingStage>;
};

const storage = new AsyncLocalStorage<OperationsTimingContext>();

/** Explicitly opt-in diagnostic mode. It must never be enabled by default. */
export function operationsTimingEnabled(): boolean {
  return process.env.OPERATIONS_TIMING === "1";
}

export function isOperationsTimingPath(pathname: string): boolean {
  return (
    pathname.startsWith("/operations/") ||
    /^\/travel-packages\/[^/]+$/.test(pathname)
  );
}

export function createOperationsTimingContext(endpoint: string): OperationsTimingContext {
  return {
    endpoint,
    startedAt: performance.now(),
    prisma: { queryCount: 0, durationMs: 0, slowestQueryMs: 0 },
    tenantTransaction: { count: 0, durationMs: 0 },
    stages: new Map(),
  };
}

export function runWithOperationsTiming<TResult>(
  context: OperationsTimingContext,
  work: () => TResult,
): TResult {
  return storage.run(context, work);
}

export function recordOperationsPrismaQuery(durationMs: number): void {
  const context = storage.getStore();
  if (!context) return;

  context.prisma.queryCount += 1;
  context.prisma.durationMs += durationMs;
  context.prisma.slowestQueryMs = Math.max(context.prisma.slowestQueryMs, durationMs);
}

export function recordOperationsTenantTransaction(durationMs: number): void {
  const context = storage.getStore();
  if (!context) return;

  context.tenantTransaction.count += 1;
  context.tenantTransaction.durationMs += durationMs;
}

export async function measureOperationsTimingStage<TResult>(
  name: string,
  work: () => Promise<TResult>,
): Promise<TResult> {
  const context = storage.getStore();
  if (!context) return work();

  const startedAt = performance.now();
  try {
    return await work();
  } finally {
    const stage = context.stages.get(name) ?? { count: 0, durationMs: 0 };
    stage.count += 1;
    stage.durationMs += performance.now() - startedAt;
    context.stages.set(name, stage);
  }
}

export function finishOperationsTiming(
  context: OperationsTimingContext,
): OperationsTimingSnapshot {
  return {
    endpoint: context.endpoint,
    durationMs: performance.now() - context.startedAt,
    prisma: { ...context.prisma },
    tenantTransaction: { ...context.tenantTransaction },
    stages: Object.fromEntries(context.stages.entries()),
  };
}

export function roundTiming(durationMs: number): number {
  return Math.round(durationMs * 100) / 100;
}
