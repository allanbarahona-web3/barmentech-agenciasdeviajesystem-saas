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

@Injectable()
export class OperationalWorkMaterializer {
  private readonly logger = new Logger(OperationalWorkMaterializer.name);
  private readonly database: OperationsDatabase;

  constructor(
    prisma: PrismaService,
    @Inject(OPERATIONAL_WORK_SOURCE_READER) private readonly sourceReader: OperationalWorkSourceReader,
  ) {
    this.database = prisma as unknown as OperationsDatabase;
  }

  async materialize(reference: OperationalWorkSourceReference): Promise<OperationalWorkMaterializationResult> {
    const source = await this.sourceReader.readSourceItem(reference);
    if (source.tenantId !== reference.tenantId || source.travelPackageId !== reference.travelPackageId
      || source.sourceType !== reference.sourceType || source.sourceId !== reference.sourceId || source.sourceLineId !== reference.sourceLineId) {
      throw new OperationalWorkMaterializationError("SOURCE_CONFLICT", false, { sourceId: reference.sourceId, sourceLineId: reference.sourceLineId });
    }
    const clientIds = uniqueClientIds(source.participantClientIds);
    if (clientIds.length === 0) {
      throw new OperationalWorkMaterializationError("PARTICIPANT_NOT_FOUND", true, { sourceId: source.sourceId, sourceLineId: source.sourceLineId, participantCount: 0 });
    }

    try {
      const result = await runTenantTransaction(this.database, source.tenantId, async (tx) => {
        const existing = await findExisting(tx, source);
        if (existing) return { status: "ALREADY_MATERIALIZED" as const, operationalRequirementId: existing.id };

        const travelPackage = await tx.travelPackage.findFirst({
          where: { id: source.travelPackageId, tenantId: source.tenantId }, select: { id: true },
        });
        if (!travelPackage) {
          throw new OperationalWorkMaterializationError("PACKAGE_MISMATCH", false, { travelPackageId: source.travelPackageId });
        }
        const participants = await tx.travelPackageParticipant.findMany({
          where: { tenantId: source.tenantId, travelPackageId: source.travelPackageId, clientId: { in: clientIds } },
          select: { id: true, clientId: true },
        });
        const resolvedClientIds = new Set(participants.map((participant) => participant.clientId));
        const missingClientCount = clientIds.filter((clientId) => !resolvedClientIds.has(clientId)).length;
        if (missingClientCount > 0 || participants.length !== clientIds.length) {
          throw new OperationalWorkMaterializationError("PARTICIPANT_NOT_FOUND", true, {
            sourceId: source.sourceId,
            sourceLineId: source.sourceLineId,
            missingParticipantCount: missingClientCount || clientIds.length - participants.length,
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
        await tx.operationalRequirementPassenger.createMany({
          data: participants.map((participant) => ({
            tenantId: source.tenantId,
            travelPackageId: source.travelPackageId,
            operationalRequirementId: requirement.id,
            travelPackageParticipantId: participant.id,
            createdByUserId: "SYSTEM",
            createdByName: "Materialización de Operaciones",
          })),
        });
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
          if (concurrent) return { status: "ALREADY_MATERIALIZED", operationalRequirementId: concurrent.id };
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

function uniqueClientIds(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isSourceIdentityConflict(error: unknown) {
  return (error instanceof Prisma.PrismaClientKnownRequestError || (typeof error === "object" && error !== null))
    && (error as { code?: unknown }).code === "P2002";
}
