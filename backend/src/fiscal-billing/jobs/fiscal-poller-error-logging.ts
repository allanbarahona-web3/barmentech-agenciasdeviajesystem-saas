export type FiscalPollerName =
  | "FiscalRefreshReconciliationPublisher"
  | "FiscalStatusReconciliationPublisher"
  | "FiscalAcceptedFanoutCoordinatorService"
  | "FiscalArtifactRetrievalPublisher"
  | "AccountReceivableRecognitionPublisher"
  | "FiscalOutboxPublisherService"
  | "FiscalTerminalArtifactFanoutCoordinatorService";

type SafeLogger = {
  error(message: string): unknown;
};

const SAFE_PRISMA_CODE = /^P\d{4}$/;

export function logFiscalPollerFailure(
  logger: SafeLogger,
  poller: FiscalPollerName,
  error: unknown,
): void {
  const prismaCode = safePrismaCode(error);
  logger.error(
    `FISCAL_POLLER_FAILURE poller=${poller} phase=POLLING_CYCLE category=${
      prismaCode ? "PRISMA" : "INFRASTRUCTURE"
    }${prismaCode ? ` code=${prismaCode}` : ""}`,
  );
}

function safePrismaCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  try {
    const value = error as { code?: unknown; errorCode?: unknown };
    const codes = [value.code, value.errorCode].filter(
      (candidate): candidate is string =>
        typeof candidate === "string" && SAFE_PRISMA_CODE.test(candidate),
    );
    const distinct = [...new Set(codes)];
    return distinct.length === 1 ? distinct[0] : null;
  } catch {
    return null;
  }
}
