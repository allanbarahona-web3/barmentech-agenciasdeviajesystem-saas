import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { runCostEngineTenantTransaction } from "./cost-engine-transaction";

export type TravelCostingProjectActor = { userId: string; name: string };

type TravelCostingProjectTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  travelPackage: Record<string, (...args: any[]) => Promise<any>>;
  internalTrip: Record<string, (...args: any[]) => Promise<any>>;
  costingProject: Record<string, (...args: any[]) => Promise<any>>;
  travelPackageCostingProjectLink: Record<string, (...args: any[]) => Promise<any>>;
  internalTripCostingProjectLink: Record<string, (...args: any[]) => Promise<any>>;
};

type TravelCostingProjectDatabase = {
  $transaction<T>(work: (transaction: TravelCostingProjectTransaction) => Promise<T>): Promise<T>;
};

type CostingProjectRead = {
  id: string;
  displayName: string;
  baseCurrency: string;
  status: string;
};

@Injectable()
export class TravelCostingProjectResolverService {
  private readonly database: TravelCostingProjectDatabase;
  private readonly logger = new Logger(TravelCostingProjectResolverService.name);

  constructor(prisma: PrismaService) {
    this.database = prisma as unknown as TravelCostingProjectDatabase;
  }

  async resolveTravelPackage(tenantId: string, travelPackageId: string, actor: TravelCostingProjectActor) {
    try {
      return await this.withTenantTransaction(tenantId, "cost-engine.resolve-travel-package", async (tx) => {
        const travelPackage = await tx.travelPackage.findFirst({
          where: { id: travelPackageId, tenantId },
          select: { id: true, name: true, priceCurrency: true },
        });
        if (!travelPackage) throw new NotFoundException("Travel package not found.");

        const existing = await tx.travelPackageCostingProjectLink.findFirst({
          where: { tenantId, travelPackageId },
          select: { costingProject: { select: projectSelect } },
        });
        if (existing) return response(existing.costingProject, "TRAVEL_PACKAGE", travelPackage.id);

        const costingProject = await this.createCostingProject(
          tx,
          tenantId,
          travelPackage.name,
          travelCurrency(travelPackage.priceCurrency),
          actor,
        );
        await tx.travelPackageCostingProjectLink.create({
          data: { tenantId, travelPackageId: travelPackage.id, costingProjectId: costingProject.id, createdByUserId: actor.userId, createdByName: actor.name },
        });
        return response(costingProject, "TRAVEL_PACKAGE", travelPackage.id);
      });
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      const existing = await this.findTravelPackageWinner(tenantId, travelPackageId);
      if (existing) return response(existing, "TRAVEL_PACKAGE", travelPackageId);
      throw error;
    }
  }

  async resolveInternalTrip(tenantId: string, internalTripId: string, actor: TravelCostingProjectActor) {
    try {
      return await this.withTenantTransaction(tenantId, "cost-engine.resolve-internal-trip", async (tx) => {
        const internalTrip = await tx.internalTrip.findFirst({
          where: { id: internalTripId, tenantId },
          select: { id: true, name: true, currency: true },
        });
        if (!internalTrip) throw new NotFoundException("Internal trip not found.");

        const existing = await tx.internalTripCostingProjectLink.findFirst({
          where: { tenantId, internalTripId },
          select: { costingProject: { select: projectSelect } },
        });
        if (existing) return response(existing.costingProject, "INTERNAL_TRIP", internalTrip.id);

        const costingProject = await this.createCostingProject(
          tx,
          tenantId,
          internalTrip.name,
          travelCurrency(internalTrip.currency),
          actor,
        );
        await tx.internalTripCostingProjectLink.create({
          data: { tenantId, internalTripId: internalTrip.id, costingProjectId: costingProject.id, createdByUserId: actor.userId, createdByName: actor.name },
        });
        return response(costingProject, "INTERNAL_TRIP", internalTrip.id);
      });
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      const existing = await this.findInternalTripWinner(tenantId, internalTripId);
      if (existing) return response(existing, "INTERNAL_TRIP", internalTripId);
      throw error;
    }
  }

  private withTenantTransaction<T>(tenantId: string, operation: string, work: (tx: TravelCostingProjectTransaction) => Promise<T>): Promise<T> {
    return runCostEngineTenantTransaction(this.database, this.logger, tenantId, operation, work);
  }

  private createCostingProject(tx: TravelCostingProjectTransaction, tenantId: string, displayName: string, baseCurrency: string, actor: TravelCostingProjectActor): Promise<CostingProjectRead> {
    return tx.costingProject.create({
      data: { tenantId, displayName, baseCurrency, createdByUserId: actor.userId, createdByName: actor.name },
      select: projectSelect,
    });
  }

  private async findTravelPackageWinner(tenantId: string, travelPackageId: string): Promise<CostingProjectRead | null> {
    return this.withTenantTransaction(tenantId, "cost-engine.resolve-travel-package.winner-read", async (tx) => {
      const link = await tx.travelPackageCostingProjectLink.findFirst({
        where: { tenantId, travelPackageId },
        select: { costingProject: { select: projectSelect } },
      });
      return link?.costingProject ?? null;
    });
  }

  private async findInternalTripWinner(tenantId: string, internalTripId: string): Promise<CostingProjectRead | null> {
    return this.withTenantTransaction(tenantId, "cost-engine.resolve-internal-trip.winner-read", async (tx) => {
      const link = await tx.internalTripCostingProjectLink.findFirst({
        where: { tenantId, internalTripId },
        select: { costingProject: { select: projectSelect } },
      });
      return link?.costingProject ?? null;
    });
  }
}

const projectSelect = { id: true, displayName: true, baseCurrency: true, status: true };

function response(project: CostingProjectRead, sourceType: "TRAVEL_PACKAGE" | "INTERNAL_TRIP", sourceId: string) {
  return { costingProject: project, source: { type: sourceType, id: sourceId } };
}

function travelCurrency(value: unknown): string {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new BadRequestException("Travel currency must be a valid three-letter code.");
  }
  return currency;
}

function isUniqueConstraint(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002";
}
