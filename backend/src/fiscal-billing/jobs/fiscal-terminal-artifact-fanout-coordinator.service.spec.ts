import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { FiscalTerminalArtifactFanoutCoordinatorService } from "./fiscal-terminal-artifact-fanout-coordinator.service";

describe("FiscalTerminalArtifactFanoutCoordinatorService", () => {
  it.each(["ACCEPTED", "REJECTED"] as const)("creates two exact artifact expectations and children for a terminal %s parent", async (taxAuthorityStatus) => {
    const c = context({ taxAuthorityStatus });

    await c.service.fanOutAvailableEvents();

    expect(c.artifacts).toEqual([
      pendingArtifact("SIGNED_FISCAL_XML"),
      pendingArtifact("TAX_AUTHORITY_RESPONSE_XML"),
    ]);
    expect(c.children).toEqual([
      child("SIGNED_FISCAL_XML"),
      child("TAX_AUTHORITY_RESPONSE_XML"),
    ]);
    expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "terminal-a", tenantId: "tenant-a", status: "PROCESSING" }),
      data: expect.objectContaining({ status: "PROCESSED", lockedAt: null, lockedBy: null }),
    }));
  });

  it("creates all artifact and child expectations before completing the parent transaction", async () => {
    const c = context();

    await c.service.fanOutAvailableEvents();

    const completeOrder = c.tx.billingOutboxEvent.updateMany.mock.invocationCallOrder[0];
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(c.tx.billingOutboxEvent.createMany).toHaveBeenCalledTimes(2);
    expect(c.tx.$executeRaw.mock.invocationCallOrder.every((order: number) => order < completeOrder)).toBe(true);
    expect(c.tx.billingOutboxEvent.createMany.mock.invocationCallOrder.every((order: number) => order < completeOrder)).toBe(true);
  });

  it.each(["artifact", "child"] as const)("does not complete the parent when %s persistence fails", async (kind) => {
    const c = context();
    if (kind === "artifact") c.tx.$executeRaw.mockRejectedValueOnce(new Error("write"));
    else c.tx.billingOutboxEvent.createMany.mockRejectedValueOnce(new Error("write"));

    await c.service.fanOutAvailableEvents();

    expect(c.tx.billingOutboxEvent.updateMany).not.toHaveBeenCalled();
    expect(c.rootOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "terminal-a", tenantId: "tenant-a", status: "PROCESSING" }),
      data: expect.objectContaining({ status: "PENDING", lockedAt: null, lockedBy: null }),
    }));
  });

  it("logs only safe diagnostics for an unexpected artifact insert failure", async () => {
    const c = context();
    const logger = (c.service as unknown as { logger: { error: jest.Mock } }).logger;
    jest.spyOn(logger, "error").mockImplementation();
    const failure = Object.assign(new Error("postgres://secret-host:5432/private"), {
      name: "PrismaClientKnownRequestError",
      code: "P2003",
      meta: { target: "private" },
    });
    c.tx.$executeRaw.mockRejectedValueOnce(failure);

    await c.service.fanOutAvailableEvents();

    expect(logger.error).toHaveBeenCalledWith(
      "FISCAL_TERMINAL_ARTIFACT_FANOUT_FAILURE tenantId=tenant-a billingDocumentId=document-a parentOutboxEventId=terminal-a operation=SIGNED_XML_ARTIFACT_INSERT errorName=PrismaClientKnownRequestError prismaCode=P2003",
    );
    expect(c.rootOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastError: "FISCAL_TERMINAL_ARTIFACT_FANOUT_FAILED" }),
    }));
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(/secret-host|postgres|private/);
  });

  it("accepts exact existing PENDING, AVAILABLE, and FAILED artifact winners without overwrite", async () => {
    const c = context({ artifacts: [
      pendingArtifact("SIGNED_FISCAL_XML"),
      availableArtifact("TAX_AUTHORITY_RESPONSE_XML"),
    ] });

    await c.service.fanOutAvailableEvents();

    expect(c.artifacts).toEqual([
      pendingArtifact("SIGNED_FISCAL_XML"),
      availableArtifact("TAX_AUTHORITY_RESPONSE_XML"),
    ]);
    expect(c.tx.billingOutboxEvent.updateMany).toHaveBeenCalledTimes(1);

    const failedArtifacts = [failedArtifact("SIGNED_FISCAL_XML"), pendingArtifact("TAX_AUTHORITY_RESPONSE_XML")];
    const failed = context({ artifacts: failedArtifacts });
    await failed.service.fanOutAvailableEvents();
    expect(failed.artifacts).toEqual(failedArtifacts);
  });

  it.each(["artifact", "child"] as const)("fails a contradictory %s winner safely", async (kind) => {
    const c = kind === "artifact"
      ? context({ artifacts: [{ ...pendingArtifact("SIGNED_FISCAL_XML"), storageKey: "contradictory" }] })
      : context({ children: [{ ...child("SIGNED_FISCAL_XML"), causationId: "other-parent" }] });

    await c.service.fanOutAvailableEvents();

    expect(c.tx.billingOutboxEvent.updateMany).not.toHaveBeenCalled();
    expect(c.rootOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED" }),
    }));
  });

  it.each([
    ["additional payload field", { payload: { ...parent().payload, extra: true } }],
    ["foreign payload tenant", { payload: { ...parent().payload, tenantId: "tenant-b" } }],
    ["wrong parent type", { eventType: "billing-document.fiscal-accepted" }],
  ])("fails malformed or foreign parents: %s", async (_, override) => {
    const c = context({ parent: parent(override) });
    await c.service.fanOutAvailableEvents();
    expect(c.tx.billingDocument.findUnique).not.toHaveBeenCalled();
    expect(c.rootOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });

  it.each([
    ["PROCESSING", new Date()],
    ["ACCEPTED", null],
  ])("fails a non-terminal or non-finalized BillingDocument: %s", async (taxAuthorityStatus, taxAuthorityFinalizedAt) => {
    const c = context({ taxAuthorityStatus, taxAuthorityFinalizedAt });
    await c.service.fanOutAvailableEvents();
    expect(c.tx.$executeRaw).not.toHaveBeenCalled();
    expect(c.rootOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });

  it("retains exactly two rows and two children through repeated cycles", async () => {
    const c = context({ claimCycles: 2 });
    await c.service.fanOutAvailableEvents();
    await c.service.fanOutAvailableEvents();
    expect(c.artifacts).toHaveLength(2);
    expect(c.children).toHaveLength(2);
  });

  it("claims only fiscal-terminal v1 parents and performs bounded neutral access", async () => {
    const c = context();
    await c.service.fanOutAvailableEvents();
    const claimSql = rawSql(c.tx.$queryRaw, 0);
    expect(claimSql).toContain('"eventType" = ?');
    expect(c.tx.$queryRaw.mock.calls[0][1]).toBe("billing-document.fiscal-terminal");
    expect(Object.keys(c.tx).sort()).toEqual(["$executeRaw", "$queryRaw", "billingDocument", "billingOutboxEvent"]);
    expect(c.tx.billingDocument.findUnique).toHaveBeenCalledTimes(1);
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(c.tx.billingOutboxEvent.findUnique).toHaveBeenCalledTimes(3);
  });
});

type Parent = ReturnType<typeof parent>;
type Artifact = {
  id: string; tenantId: string; billingDocumentId: string;
  artifactType: "SIGNED_FISCAL_XML" | "TAX_AUTHORITY_RESPONSE_XML"; version: number; status: string;
  storageProvider: string | null; storageKey: string | null; sha256: string | null; byteSize: bigint | null;
  mimeType: string | null; sourceEtag: string | null; retrievedAt: Date | null; storedAt: Date | null;
  terminalErrorCode: string | null; failedAt: Date | null;
};
type Child = ReturnType<typeof child>;
type ContextOptions = {
  parent?: Parent;
  taxAuthorityStatus?: string;
  taxAuthorityFinalizedAt?: Date | null;
  artifacts?: Artifact[];
  children?: Child[];
  claimCycles?: number;
};

function parent(overrides: Record<string, unknown> = {}) {
  return {
    id: "terminal-a", tenantId: "tenant-a", eventType: "billing-document.fiscal-terminal", eventVersion: 1,
    aggregateType: "BillingDocument", aggregateId: "document-a",
    payload: { tenantId: "tenant-a", billingDocumentId: "document-a", eventVersion: 1 },
    attemptCount: 1, maximumAttempts: 5, status: "PROCESSING", lockedBy: expect.anything(), ...overrides,
  };
}
function pendingArtifact(artifactType: "SIGNED_FISCAL_XML" | "TAX_AUTHORITY_RESPONSE_XML") {
  return artifactBase(artifactType, { status: "PENDING" });
}
function availableArtifact(artifactType: "SIGNED_FISCAL_XML" | "TAX_AUTHORITY_RESPONSE_XML") {
  const retrievedAt = new Date("2026-09-09T00:00:00.000Z");
  return artifactBase(artifactType, {
    status: "AVAILABLE", storageProvider: "PRIMARY_PRIVATE_OBJECT_STORAGE", storageKey: `key-${artifactType}`,
    sha256: "a".repeat(64), byteSize: 1n, mimeType: "application/xml", retrievedAt, storedAt: retrievedAt,
  });
}
function failedArtifact(artifactType: "SIGNED_FISCAL_XML" | "TAX_AUTHORITY_RESPONSE_XML") {
  return artifactBase(artifactType, { status: "FAILED", terminalErrorCode: "ARTIFACT_UNAVAILABLE", failedAt: new Date() });
}
function artifactBase(artifactType: "SIGNED_FISCAL_XML" | "TAX_AUTHORITY_RESPONSE_XML", overrides: Partial<Artifact>): Artifact {
  return {
    id: `artifact-${artifactType}`, tenantId: "tenant-a", billingDocumentId: "document-a", artifactType, version: 1,
    status: "PENDING", storageProvider: null, storageKey: null, sha256: null, byteSize: null, mimeType: null,
    sourceEtag: null, retrievedAt: null, storedAt: null, terminalErrorCode: null, failedAt: null, ...overrides,
  };
}
function child(artifactType: "SIGNED_FISCAL_XML" | "TAX_AUTHORITY_RESPONSE_XML") {
  const deduplicationKey = artifactType === "SIGNED_FISCAL_XML"
    ? "billing-document.fiscal-terminal:signed-xml:document-a:v1"
    : "billing-document.fiscal-terminal:tax-response-xml:document-a:v1";
  return {
    id: `child-${artifactType}`, tenantId: "tenant-a", eventType: "billing-document.artifact-retrieval-requested", eventVersion: 1,
    aggregateType: "BillingDocument", aggregateId: "document-a", causationId: "terminal-a", deduplicationKey,
    payload: { tenantId: "tenant-a", billingDocumentId: "document-a", artifactType, artifactVersion: 1, eventVersion: 1 },
  };
}

function context(options: ContextOptions = {}) {
  const terminal = options.parent ?? parent();
  const artifacts = [...(options.artifacts ?? [])];
  const children = [...(options.children ?? [])];
  let claims = 0;
  const queryRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes("WITH eligible")) return claims++ < (options.claimCycles ?? 1) ? [terminal] : [];
    if (sql.includes('FROM "billing_document_artifacts"')) {
      const artifactType = values[2] as string;
      return artifacts.filter((item) => item.artifactType === artifactType);
    }
    return [{ id: terminal.id }];
  });
  const executeRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes('INSERT INTO "billing_document_artifacts"')) {
      const artifactType = values[3] as "SIGNED_FISCAL_XML" | "TAX_AUTHORITY_RESPONSE_XML";
      if (!artifacts.some((item) => item.artifactType === artifactType)) artifacts.push(pendingArtifact(artifactType));
    }
    return 1;
  });
  const tx = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    billingDocument: {
      findUnique: jest.fn().mockResolvedValue({
        id: "document-a", tenantId: "tenant-a", taxAuthorityStatus: options.taxAuthorityStatus ?? "ACCEPTED",
        taxAuthorityFinalizedAt: options.taxAuthorityFinalizedAt === undefined ? new Date() : options.taxAuthorityFinalizedAt,
      }),
    },
    billingOutboxEvent: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id) return terminal;
        const identity = where.tenantId_deduplicationKey as { deduplicationKey: string };
        return children.find((item) => item.deduplicationKey === identity.deduplicationKey) ?? null;
      }),
      createMany: jest.fn(async ({ data }: { data: Child }) => {
        if (!children.some((item) => item.deduplicationKey === data.deduplicationKey)) {
          children.push(child(data.payload.artifactType as "SIGNED_FISCAL_XML" | "TAX_AUTHORITY_RESPONSE_XML"));
        }
        return { count: 1 };
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const rootOutbox = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
  const prisma = {
    $transaction: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)),
    billingOutboxEvent: rootOutbox,
  } as unknown as PrismaService;
  return { service: new FiscalTerminalArtifactFanoutCoordinatorService(prisma), tx, rootOutbox, artifacts, children };
}

function rawSql(mock: jest.Mock, index: number): string {
  return (mock.mock.calls[index][0] as TemplateStringsArray).join("?");
}
