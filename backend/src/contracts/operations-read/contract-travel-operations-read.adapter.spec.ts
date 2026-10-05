import { MODULE_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { ContractsModule } from "../contracts.module";
import { ContractTravelOperationsReadAdapter } from "./contract-travel-operations-read.adapter";
import { OPERATIONAL_PASSENGER_NOTE_READER } from "./operational-passenger-note-reader.port";
import { OPERATIONAL_PASSENGER_CONTRACT_CONTEXT_READER } from "./operational-passenger-contract-context-reader.port";
import { PARTICIPANT_SOURCE_READER } from "./participant-source-reader.port";

describe("ContractTravelOperationsReadAdapter", () => {
  it("reads multiple Contract sources in one bounded tenant/package query and preserves empty participants", async () => {
    const c = context();
    c.tx.travelPackageParticipantContractSource.findMany.mockResolvedValue([
      { travelPackageParticipantId: "participant-1", contractId: "contract-1", sourceRole: "HOLDER", createdAt: first },
      { travelPackageParticipantId: "participant-1", contractId: "contract-2", sourceRole: "COMPANION", createdAt: second },
    ]);

    const result = await c.adapter.readSourcesForParticipants({
      tenantId: "tenant-1",
      travelPackageId: "package-1",
      participantIds: ["participant-1", "participant-1", "participant-2"],
    });

    expect(result.get("participant-1")).toEqual([
      { travelPackageParticipantId: "participant-1", sourceType: "CONTRACT", sourceId: "contract-1", sourceRole: "HOLDER", linkedAt: first },
      { travelPackageParticipantId: "participant-1", sourceType: "CONTRACT", sourceId: "contract-2", sourceRole: "COMPANION", linkedAt: second },
    ]);
    expect(result.get("participant-2")).toEqual([]);
    expect(c.tx.travelPackageParticipantContractSource.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.travelPackageParticipantContractSource.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        travelPackageId: "package-1",
        travelPackageParticipantId: { in: ["participant-1", "participant-2"] },
      },
      select: {
        travelPackageParticipantId: true,
        contractId: true,
        sourceRole: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("does not query provenance for an empty participant batch", async () => {
    const c = context();
    await expect(c.adapter.readSourcesForParticipants({
      tenantId: "tenant-1", travelPackageId: "package-1", participantIds: [],
    })).resolves.toEqual(new Map());
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("reads bounded Contract participant context with frozen and legacy commercial context", async () => {
    const c = context();
    c.tx.travelPackageParticipantContractSource.findMany.mockResolvedValue([
      contractContextSource({ travelPackageParticipantId: "participant-holder", sourceRole: "HOLDER" }),
      contractContextSource({ travelPackageParticipantId: "participant-companion", sourceRole: "COMPANION", travelPackageParticipant: { clientId: "client-companion" } }),
      contractContextSource({ travelPackageParticipantId: "participant-minor", sourceRole: "MINOR", travelPackageParticipant: { clientId: "client-minor" }, contract: { id: "contract-legacy", contractNumber: "CT-LEGACY", commercialTotal: { toString: () => "750.00000" }, commercialCurrency: "USD", commercialSnapshot: null } }),
    ]);
    const result = await c.adapter.readContractContextsForParticipants({
      tenantId: "tenant-1", travelPackageId: "package-1", participantIds: ["participant-holder", "participant-companion", "participant-minor"],
    });
    expect(result.get("participant-holder")).toEqual([expect.objectContaining({
      clientId: "client-holder", contractId: "contract-1", contractNumber: "CT-1", sourceRole: "HOLDER",
      commercial: { snapshotAvailable: true, perPersonSellingPrice: "250.00000", commercialTotal: "500.00000", currency: "USD", frozenAt: first },
      responsibleAdult: null,
    })]);
    expect(result.get("participant-companion")).toEqual([expect.objectContaining({ sourceRole: "COMPANION", contractNumber: "CT-1" })]);
    expect(result.get("participant-minor")).toEqual([expect.objectContaining({
      sourceRole: "MINOR", commercial: { snapshotAvailable: false, perPersonSellingPrice: null, commercialTotal: "750.00000", currency: "USD", frozenAt: null }, responsibleAdult: null,
    })]);
    expect(c.tx.travelPackageParticipantContractSource.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.travelPackageParticipantContractSource.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-1", travelPackageId: "package-1", travelPackageParticipantId: { in: ["participant-holder", "participant-companion", "participant-minor"] } },
      select: expect.objectContaining({ contract: { select: expect.not.objectContaining({ payload: true }) } }),
    }));
    expect((c.tx as Record<string, unknown>).contract).toBeUndefined();
  });

  it("reads only ACTIVE normalized notes through the bounded participant/client map", async () => {
    const c = context();
    c.tx.travelPackageParticipant.findMany.mockResolvedValue([
      { id: "participant-1", clientId: "client-1" },
      { id: "participant-2", clientId: "client-2" },
    ]);
    c.tx.contractNote.findMany.mockResolvedValue([
      { id: "note-2", clientId: "client-1", contractId: "contract-2", note: "Second", status: "ACTIVE", createdAt: second, archivedAt: null, createdByName: "Agent" },
      { id: "note-1", clientId: "client-1", contractId: "contract-1", note: "First", status: "ACTIVE", createdAt: first, archivedAt: null, createdByName: "Agent" },
      { id: "archived", clientId: "client-1", contractId: "contract-1", note: "Archived", status: "ARCHIVED", createdAt: first, archivedAt: first, createdByName: "Agent" },
      { id: "legacy", clientId: null, contractId: "legacy-contract", note: "Do not guess", status: "ACTIVE", createdAt: first, archivedAt: null, createdByName: "Agent" },
    ]);

    const result = await c.adapter.readNotesForParticipants({
      tenantId: "tenant-1",
      travelPackageId: "package-1",
      participantIds: ["participant-1", "participant-1", "participant-2"],
    });

    expect(result.get("participant-1")).toEqual([
      { id: "note-2", travelPackageParticipantId: "participant-1", text: "Second", status: "ACTIVE", createdAt: second, archivedAt: null, sourceType: "CONTRACT", authorName: "Agent", source: { type: "CONTRACT_NOTE", sourceId: "contract-2" } },
      { id: "note-1", travelPackageParticipantId: "participant-1", text: "First", status: "ACTIVE", createdAt: first, archivedAt: null, sourceType: "CONTRACT", authorName: "Agent", source: { type: "CONTRACT_NOTE", sourceId: "contract-1" } },
    ]);
    expect(result.get("participant-2")).toEqual([]);
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.contractNote.findMany).toHaveBeenCalledTimes(1);
    expect(c.tx.travelPackageParticipant.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        travelPackageId: "package-1",
        id: { in: ["participant-1", "participant-2"] },
      },
      select: { id: true, clientId: true },
    });
    expect(c.tx.contractNote.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        travelPackageId: "package-1",
        clientId: { in: ["client-1", "client-2"] },
        status: "ACTIVE",
      },
      select: {
        id: true,
        clientId: true,
        contractId: true,
        note: true,
        status: true,
        createdAt: true,
        archivedAt: true,
        createdByName: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    expect((c.tx as Record<string, unknown>).customerNote).toBeUndefined();
  });

  it("does not query notes for an empty participant batch", async () => {
    const c = context();
    await expect(c.adapter.readNotesForParticipants({
      tenantId: "tenant-1", travelPackageId: "package-1", participantIds: [],
    })).resolves.toEqual(new Map());
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("binds both neutral ports to the Contract/Travel adapter", () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ContractsModule);
    expect(providers).toEqual(expect.arrayContaining([
      ContractTravelOperationsReadAdapter,
      { provide: PARTICIPANT_SOURCE_READER, useExisting: ContractTravelOperationsReadAdapter },
      { provide: OPERATIONAL_PASSENGER_NOTE_READER, useExisting: ContractTravelOperationsReadAdapter },
      { provide: OPERATIONAL_PASSENGER_CONTRACT_CONTEXT_READER, useExisting: ContractTravelOperationsReadAdapter },
    ]));
  });

  it("resolves Contract read ports without a ContractNotesService dependency", async () => {
    const module = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: context().prisma },
        ContractTravelOperationsReadAdapter,
        { provide: PARTICIPANT_SOURCE_READER, useExisting: ContractTravelOperationsReadAdapter },
        { provide: OPERATIONAL_PASSENGER_NOTE_READER, useExisting: ContractTravelOperationsReadAdapter },
        { provide: OPERATIONAL_PASSENGER_CONTRACT_CONTEXT_READER, useExisting: ContractTravelOperationsReadAdapter },
      ],
    }).compile();

    const adapter = module.get(ContractTravelOperationsReadAdapter);
    expect(module.get(PARTICIPANT_SOURCE_READER)).toBe(adapter);
    expect(module.get(OPERATIONAL_PASSENGER_NOTE_READER)).toBe(adapter);
    expect(module.get(OPERATIONAL_PASSENGER_CONTRACT_CONTEXT_READER)).toBe(adapter);
  });
});

const first = new Date("2026-09-29T12:00:00.000Z");
const second = new Date("2026-09-29T13:00:00.000Z");

function context() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    travelPackageParticipantContractSource: { findMany: jest.fn() },
    travelPackageParticipant: { findMany: jest.fn() },
    contractNote: { findMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
  };
  return {
    adapter: new ContractTravelOperationsReadAdapter(prisma as any),
    prisma,
    tx,
  };
}

function contractContextSource(overrides: Record<string, unknown> = {}) {
  return {
    travelPackageParticipantId: "participant-holder", sourceRole: "HOLDER",
    travelPackageParticipant: { clientId: "client-holder" },
    contract: {
      id: "contract-1", contractNumber: "CT-1", commercialTotal: { toString: () => "500.00000" }, commercialCurrency: "USD",
      commercialSnapshot: { perPersonSellingPrice: { toString: () => "250.00000" }, commercialTotal: { toString: () => "500.00000" }, currency: "USD", frozenAt: first },
    },
    ...overrides,
  };
}
