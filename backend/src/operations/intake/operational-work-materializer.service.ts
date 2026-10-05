import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import {
  OPERATIONAL_WORK_SOURCE_READER,
  OperationalWorkMaterializationError,
  type OperationalWorkSourceItem,
  type OperationalWorkSourceReader,
  type OperationalWorkSourceReference,
} from "./operational-work-source-reader.port";
import {
  OPERATIONAL_CONTRACTED_TRAVEL_PACKAGE_ROSTER_READER,
  type ContractedTravelPackageRosterReader,
} from "./contracted-travel-package-roster-reader.port";

type OperationsTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  travelPackage: { findFirst(args: unknown): Promise<{ id: string } | null> };
  travelPackageParticipant: { findMany(args: unknown): Promise<Array<{ id: string; clientId: string }>> };
  operationalRequirement: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<{ id: string }>;
  };
  operationalRequirementPassenger: { createMany(args: unknown): Promise<unknown> };
};

type OperationsDatabase = {
  $transaction<T>(work: (transaction: OperationsTransaction) => Promise<T>): Promise<T>;
};

export type OperationalWorkMaterializationResult = {
  status: "CREATED" | "ALREADY_MATERIALIZED";
  operationalRequirementId: string;
};

const PARTICIPANT_BATCH_SIZE = 25;

@Injectable()
export class OperationalWorkMaterializer {
  private readonly logger = new Logger(OperationalWorkMaterializer.name);
  private readonly database: OperationsDatabase;

  constructor(
    prisma: PrismaService,
    @Inject(OPERATIONAL_WORK_SOURCE_READER) private readonly sourceReader: OperationalWorkSourceReader,
    @Inject(OPERATIONAL_CONTRACTED_TRAVEL_PACKAGE_ROSTER_READER)
    private readonly contractedRosterReader: ContractedTravelPackageRosterReader,
  ) {
    this.database = prisma as unknown as OperationsDatabase;
  }

  async materialize(reference: OperationalWorkSourceReference): Promise<OperationalWorkMaterializationResult> {
    const source = await this.sourceReader.readSourceItem(reference);
    if (source.tenantId !== reference.tenantId || source.travelPackageId !== reference.travelPackageId
      || source.sourceType !== reference.sourceType || source.sourceId !== reference.sourceId || source.sourceLineId !== reference.sourceLineId) {
      throw new OperationalWorkMaterializationError("SOURCE_CONFLICT", false, { sourceId: reference.sourceId, sourceLineId: reference.sourceLineId });
    }
    const baseParticipantIds = source.participantScope === "ALL_CONTRACTED_TRAVEL_PACKAGE_PARTICIPANTS"
      ? await this.readAllContractedParticipantIds(source)
      : null;
    const clientIds = uniqueClientIds(source.participantClientIds);
    if (baseParticipantIds === null && clientIds.length === 0) {
      throw new OperationalWorkMaterializationError("PARTICIPANT_NOT_FOUND", true, { sourceId: source.sourceId, sourceLineId: source.sourceLineId, participantCount: 0 });
    }

    try {
      const result = await runTenantTransaction(this.database, source.tenantId, async (tx) => {
        const existing = await findExisting(tx, source);
        // Additional Services keeps its existing explicit-source behavior. Base
        // components alone use the contracted package roster as their scope.
        if (existing && baseParticipantIds === null) {
          return { status: "ALREADY_MATERIALIZED" as const, operationalRequirementId: existing.id };
        }

        const travelPackage = await tx.travelPackage.findFirst({
          where: { id: source.travelPackageId, tenantId: source.tenantId }, select: { id: true },
        });
        if (!travelPackage) {
          throw new OperationalWorkMaterializationError("PACKAGE_MISMATCH", false, { travelPackageId: source.travelPackageId });
        }
        const participants = baseParticipantIds === null
          ? await tx.travelPackageParticipant.findMany({
            where: {
              tenantId: source.tenantId,
              travelPackageId: source.travelPackageId,
              clientId: { in: clientIds },
            },
            select: { id: true, clientId: true },
          })
          : await findBaseParticipantsInBatches(tx, source, baseParticipantIds);
        const expectedParticipantIds = baseParticipantIds ?? clientIds;
        const resolvedValues = new Set(baseParticipantIds === null
          ? participants.map((participant) => participant.clientId)
          : participants.map((participant) => participant.id));
        const missingParticipantCount = expectedParticipantIds.filter((value) => !resolvedValues.has(value)).length;
        if (missingParticipantCount > 0 || participants.length !== expectedParticipantIds.length) {
          throw new OperationalWorkMaterializationError("PARTICIPANT_NOT_FOUND", true, {
            sourceId: source.sourceId,
            sourceLineId: source.sourceLineId,
            missingParticipantCount: missingParticipantCount || expectedParticipantIds.length - participants.length,
          });
        }

        if (existing) {
          await createBasePassengerAssignments(tx, source, existing.id, participants);
          return { status: "ALREADY_MATERIALIZED" as const, operationalRequirementId: existing.id };
        }
        if (participants.length === 0) {
          throw new OperationalWorkMaterializationError("PARTICIPANT_NOT_FOUND", true, {
            sourceId: source.sourceId,
            sourceLineId: source.sourceLineId,
            participantCount: 0,
          });
        }

        let requirement: { id: string };
        try {
          requirement = await tx.operationalRequirement.create({
            data: requirementCreateData(source),
            select: { id: true },
          });
        } catch (error) {
          if (isSourceIdentityConflict(error)) {
            throw new OperationalWorkMaterializationError("SOURCE_CONFLICT", false, {
              sourceId: source.sourceId,
              sourceLineId: source.sourceLineId,
            });
          }
          throw error;
        }
        await createPassengerAssignments(tx, source, requirement.id, participants, false);
        return { status: "CREATED" as const, operationalRequirementId: requirement.id };
      });
      if (result.status === "CREATED") {
        this.logger.log({ message: "Operational work materialized", tenantId: source.tenantId, travelPackageId: source.travelPackageId, sourceId: source.sourceId, sourceLineId: source.sourceLineId });
      }
      return result;
    } catch (error) {
      if (error instanceof OperationalWorkMaterializationError && error.code === "SOURCE_CONFLICT") {
        return runTenantTransaction(this.database, source.tenantId, async (tx) => {
          const concurrent = await findExisting(tx, source);
          if (concurrent) {
            if (baseParticipantIds !== null) {
              const participants = await findBaseParticipantsInBatches(tx, source, baseParticipantIds);
              if (participants.length !== baseParticipantIds.length) {
                throw new OperationalWorkMaterializationError("PARTICIPANT_NOT_FOUND", true, {
                  sourceId: source.sourceId,
                  sourceLineId: source.sourceLineId,
                  missingParticipantCount: baseParticipantIds.length - participants.length,
                });
              }
              await createBasePassengerAssignments(tx, source, concurrent.id, participants);
            }
            return { status: "ALREADY_MATERIALIZED", operationalRequirementId: concurrent.id };
          }
          throw error;
        });
      }
      if (error instanceof OperationalWorkMaterializationError) throw error;
      throw new OperationalWorkMaterializationError("MATERIALIZATION_FAILED", true, {
        sourceId: source.sourceId,
        sourceLineId: source.sourceLineId,
      });
    }
  }

  private async readAllContractedParticipantIds(source: OperationalWorkSourceItem): Promise<string[]> {
    const participantIds: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.contractedRosterReader.readContractedRoster({
        tenantId: source.tenantId,
        travelPackageId: source.travelPackageId,
        cursor,
        limit: PARTICIPANT_BATCH_SIZE,
      });
      participantIds.push(...page.participants.map((participant) => participant.id));
      if (page.nextCursor === cursor) {
        throw new OperationalWorkMaterializationError("MATERIALIZATION_FAILED", true, {
          sourceId: source.sourceId,
          sourceLineId: source.sourceLineId,
        });
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return [...new Set(participantIds)];
  }
}

function findExisting(tx: OperationsTransaction, source: { tenantId: string; travelPackageId: string; sourceType: string; sourceId: string; sourceLineId: string }) {
  return tx.operationalRequirement.findFirst({
    where: {
      tenantId: source.tenantId,
      travelPackageId: source.travelPackageId,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceLineId: source.sourceLineId,
    },
    select: { id: true },
  });
}

function requirementCreateData(source: OperationalWorkSourceItem) {
  return {
    tenantId: source.tenantId,
    travelPackageId: source.travelPackageId,
    servicePurposeCode: source.servicePurposeCode,
    servicePurposeName: source.servicePurposeName,
    description: source.description,
    status: "PENDING",
    critical: false,
    operationalDeadlineAt: null,
    assignedToUserId: null,
    assignedToName: null,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    sourceLineId: source.sourceLineId,
    sourceVersionId: source.sourceVersionId,
    ...(source.sourceSnapshot === null ? {} : { sourceSnapshot: jsonSnapshot(source.sourceSnapshot) }),
    sourceReference: source.sourceReference,
    sourceAcceptedAt: source.sourceAcceptedAt,
    sourcePassengerGroupId: null,
    sourcePassengerGroupName: null,
    sourcePassengerGroupServiceCode: null,
    soldAmount: source.soldValue ? new Prisma.Decimal(source.soldValue.amount) : null,
    soldCurrency: source.soldValue?.currency ?? null,
    soldValueScope: source.soldValue?.scope ?? "NONE",
    createdByUserId: "SYSTEM",
    createdByName: "Materialización de Operaciones",
  };
}

/** Source adapters own the shape; this only makes their neutral context safe for Prisma JSON storage. */
function jsonSnapshot(snapshot: NonNullable<OperationalWorkSourceItem["sourceSnapshot"]>) {
  return jsonValue(snapshot);
}

function jsonValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new OperationalWorkMaterializationError("MATERIALIZATION_FAILED", false, {});
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object") {
    if (isDecimalLike(value)) return value.toString();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new OperationalWorkMaterializationError("MATERIALIZATION_FAILED", false, {});
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  }
  throw new OperationalWorkMaterializationError("MATERIALIZATION_FAILED", false, {});
}

function isDecimalLike(value: object): value is { toString(): string } {
  return value.constructor?.name === "Decimal" && typeof (value as { toString?: unknown }).toString === "function";
}

function requirementPassengerData(
  source: OperationalWorkSourceItem,
  operationalRequirementId: string,
  participants: Array<{ id: string }>,
) {
  return participants.map((participant) => ({
    tenantId: source.tenantId,
    travelPackageId: source.travelPackageId,
    operationalRequirementId,
    travelPackageParticipantId: participant.id,
    createdByUserId: "SYSTEM",
    createdByName: "Materialización de Operaciones",
  }));
}

async function findBaseParticipantsInBatches(
  tx: OperationsTransaction,
  source: OperationalWorkSourceItem,
  participantIds: readonly string[],
) {
  const participants: Array<{ id: string; clientId: string }> = [];
  for (const ids of batches(participantIds, PARTICIPANT_BATCH_SIZE)) {
    participants.push(...await tx.travelPackageParticipant.findMany({
      where: { tenantId: source.tenantId, travelPackageId: source.travelPackageId, id: { in: ids } },
      select: { id: true, clientId: true },
    }));
  }
  return participants;
}

function createBasePassengerAssignments(
  tx: OperationsTransaction,
  source: OperationalWorkSourceItem,
  operationalRequirementId: string,
  participants: Array<{ id: string }>,
) {
  return createPassengerAssignments(tx, source, operationalRequirementId, participants, true);
}

async function createPassengerAssignments(
  tx: OperationsTransaction,
  source: OperationalWorkSourceItem,
  operationalRequirementId: string,
  participants: Array<{ id: string }>,
  skipDuplicates: boolean,
) {
  for (const group of batches(participants, PARTICIPANT_BATCH_SIZE)) {
    await tx.operationalRequirementPassenger.createMany({
      data: requirementPassengerData(source, operationalRequirementId, group),
      ...(skipDuplicates ? { skipDuplicates: true } : {}),
    });
  }
}

function* batches<T>(values: readonly T[], size: number): Generator<T[]> {
  for (let index = 0; index < values.length; index += size) yield values.slice(index, index + size);
}

function uniqueClientIds(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isSourceIdentityConflict(error: unknown) {
  return (error instanceof Prisma.PrismaClientKnownRequestError || (typeof error === "object" && error !== null))
    && (error as { code?: unknown }).code === "P2002";
}
