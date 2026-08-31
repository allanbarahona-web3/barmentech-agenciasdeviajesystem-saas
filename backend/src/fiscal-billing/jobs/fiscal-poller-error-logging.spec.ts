import { logFiscalPollerFailure } from "./fiscal-poller-error-logging";

describe("logFiscalPollerFailure", () => {
  it.each([
    ["P1001", { errorCode: "P1001" }],
    ["P2024", { code: "P2024" }],
  ])("logs Prisma %s using only its safe code", (code, identity) => {
    const logger = loggerMock();
    const error = Object.assign(
      new Error("Can't reach secret-db.example.test:25060 DATABASE_URL=secret"),
      identity,
      { cause: new Error("native cause") },
    );

    logFiscalPollerFailure(
      logger,
      "FiscalOutboxPublisherService",
      error,
    );

    expect(logger.error).toHaveBeenCalledWith(
      `FISCAL_POLLER_FAILURE poller=FiscalOutboxPublisherService phase=POLLING_CYCLE category=PRISMA code=${code}`,
    );
    expect(serializedCalls(logger)).not.toMatch(
      /secret-db|25060|DATABASE_URL|native cause|Can't reach|stack/i,
    );
  });

  it.each(["P10010", "P20A4", "P2024 private-host:25060", "E1001", 1001])(
    "does not expose malformed or non-Prisma code %p",
    (code) => {
      const logger = loggerMock();
      logFiscalPollerFailure(
        logger,
        "FiscalStatusReconciliationPublisher",
        { code, message: "private-host:25060" },
      );

      expect(logger.error).toHaveBeenCalledWith(
        "FISCAL_POLLER_FAILURE poller=FiscalStatusReconciliationPublisher phase=POLLING_CYCLE category=INFRASTRUCTURE",
      );
      expect(serializedCalls(logger)).not.toContain(String(code));
      expect(serializedCalls(logger)).not.toContain("private-host");
    },
  );

  it("classifies a generic error without exposing its message, stack, or cause", () => {
    const logger = loggerMock();
    const error = Object.assign(new Error("credential@database.internal:25060"), {
      cause: "DATABASE_URL=postgresql://secret",
    });

    logFiscalPollerFailure(
      logger,
      "FiscalTerminalArtifactFanoutCoordinatorService",
      error,
    );

    expect(logger.error).toHaveBeenCalledWith(
      "FISCAL_POLLER_FAILURE poller=FiscalTerminalArtifactFanoutCoordinatorService phase=POLLING_CYCLE category=INFRASTRUCTURE",
    );
    expect(serializedCalls(logger)).not.toMatch(
      /credential|database\.internal|25060|DATABASE_URL|postgresql|secret|stack/i,
    );
  });

  it("fails closed when reading an error code throws", () => {
    const logger = loggerMock();
    const error = Object.defineProperty({}, "code", {
      get: () => {
        throw new Error("native getter detail");
      },
    });

    expect(() =>
      logFiscalPollerFailure(
        logger,
        "FiscalAcceptedFanoutCoordinatorService",
        error,
      ),
    ).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      "FISCAL_POLLER_FAILURE poller=FiscalAcceptedFanoutCoordinatorService phase=POLLING_CYCLE category=INFRASTRUCTURE",
    );
  });
});

function loggerMock() {
  return { error: jest.fn() };
}

function serializedCalls(logger: ReturnType<typeof loggerMock>): string {
  return JSON.stringify(logger.error.mock.calls);
}
