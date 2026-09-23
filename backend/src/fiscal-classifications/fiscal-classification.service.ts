import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { FiscalItemCategory } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { FiscalCatalogService } from "../fiscal-catalogs/fiscal-catalog.service";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import type {
  CreateFiscalClassificationDto,
  UpdateFiscalClassificationDto,
} from "./fiscal-classification.dto";

export type FiscalClassificationActor = { userId: string; name: string };

export type TenantFiscalClassificationRecord = {
  id: string;
  tenantId: string;
  displayName: string;
  description: string | null;
  fiscalItemCategory: FiscalItemCategory;
  cabysCode: string;
  unitOfMeasureCode: string;
  taxCode: string;
  taxRateCode: string;
  taxPercentage: { toFixed: (digits?: number) => string };
  isActive: boolean;
  isDefaultForCustomQuotations: boolean;
  createdByUserId: string;
  createdByName: string;
  updatedByUserId: string | null;
  updatedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TenantFiscalClassificationReader = {
  tenantFiscalClassification: Record<string, (...args: any[]) => Promise<any>>;
};

type ClassificationTransaction = TenantFiscalClassificationReader & {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type ClassificationDatabase = {
  $transaction<T>(work: (transaction: ClassificationTransaction) => Promise<T>): Promise<T>;
};

@Injectable()
export class FiscalClassificationService {
  private readonly database: ClassificationDatabase;

  constructor(
    prisma: PrismaService,
    private readonly fiscalCatalogs: FiscalCatalogService,
  ) {
    // Prisma generation is deliberately manual in this repository.
    this.database = prisma as unknown as ClassificationDatabase;
  }

  list(tenantId: string, active?: boolean, page = 1, pageSize = 20) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      const where = { tenantId, ...(active === undefined ? {} : { isActive: active }) };
      const [rows, total] = await Promise.all([
        tx.tenantFiscalClassification.findMany({
          where,
          orderBy: [{ displayName: "asc" }, { id: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }) as Promise<TenantFiscalClassificationRecord[]>,
        tx.tenantFiscalClassification.count({ where }) as Promise<number>,
      ]);
      return { items: rows.map(toResponse), total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    });
  }

  async find(tenantId: string, classificationId: string) {
    const row = await this.findRecord(tenantId, classificationId);
    if (!row) throw new NotFoundException("FISCAL_CLASSIFICATION_NOT_FOUND");
    return toResponse(row);
  }

  async create(
    tenantId: string,
    input: CreateFiscalClassificationDto,
    actor: FiscalClassificationActor,
  ) {
    const selection = await this.resolveSelection(tenantId, input);
    try {
      return await this.withTenantTransaction(tenantId, async (tx) => {
        const row = await tx.tenantFiscalClassification.create({
          data: {
            tenantId,
            displayName: input.displayName,
            description: optionalText(input.description),
            fiscalItemCategory: input.fiscalItemCategory,
            ...selection,
            isActive: true,
            createdByUserId: actor.userId,
            createdByName: actor.name,
          },
        }) as TenantFiscalClassificationRecord;
        return toResponse(row);
      });
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new ConflictException("FISCAL_CLASSIFICATION_DISPLAY_NAME_CONFLICT");
      }
      throw error;
    }
  }

  async update(
    tenantId: string,
    classificationId: string,
    input: UpdateFiscalClassificationDto,
    actor: FiscalClassificationActor,
  ) {
    const current = await this.findRecord(tenantId, classificationId);
    if (!current) throw new NotFoundException("FISCAL_CLASSIFICATION_NOT_FOUND");
    const updatesFiscalIdentity = hasFiscalIdentityUpdate(input);
    const selection = updatesFiscalIdentity
      ? await this.resolveSelection(tenantId, {
          cabysCode: input.cabysCode ?? current.cabysCode,
          unitOfMeasureCode: input.unitOfMeasureCode ?? current.unitOfMeasureCode,
          taxCode: input.taxCode ?? current.taxCode,
          taxRateCode: input.taxRateCode ?? current.taxRateCode,
        })
      : null;
    try {
      return await this.withTenantTransaction(tenantId, async (tx) => {
        const updated = await tx.tenantFiscalClassification.updateMany({
          where: { id: classificationId, tenantId, updatedAt: current.updatedAt },
          data: {
            ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
            ...(input.description === undefined ? {} : { description: optionalText(input.description) }),
            ...(input.fiscalItemCategory === undefined ? {} : { fiscalItemCategory: input.fiscalItemCategory }),
            ...(selection ?? {}),
            updatedByUserId: actor.userId,
            updatedByName: actor.name,
          },
        });
        if (updated.count !== 1) {
          const exists = await tx.tenantFiscalClassification.findFirst({ where: { id: classificationId, tenantId } });
          if (!exists) throw new NotFoundException("FISCAL_CLASSIFICATION_NOT_FOUND");
          throw new ConflictException("FISCAL_CLASSIFICATION_UPDATE_CONFLICT");
        }
        const row = await tx.tenantFiscalClassification.findFirst({ where: { id: classificationId, tenantId } }) as TenantFiscalClassificationRecord | null;
        if (!row) throw new NotFoundException("FISCAL_CLASSIFICATION_NOT_FOUND");
        return toResponse(row);
      });
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new ConflictException("FISCAL_CLASSIFICATION_DISPLAY_NAME_CONFLICT");
      }
      throw error;
    }
  }

  async setStatus(
    tenantId: string,
    classificationId: string,
    isActive: boolean,
    actor: FiscalClassificationActor,
  ) {
    const current = await this.findRecord(tenantId, classificationId);
    if (!current) throw new NotFoundException("FISCAL_CLASSIFICATION_NOT_FOUND");
    if (isActive) {
      await this.resolveSelection(tenantId, current);
    }
    return this.withTenantTransaction(tenantId, async (tx) => {
      const updated = await tx.tenantFiscalClassification.updateMany({
        where: { id: classificationId, tenantId, ...(current ? { updatedAt: current.updatedAt } : {}) },
        data: {
          isActive,
          ...(isActive ? {} : { isDefaultForCustomQuotations: false }),
          updatedByUserId: actor.userId,
          updatedByName: actor.name,
        },
      });
      if (updated.count !== 1) {
        const exists = await tx.tenantFiscalClassification.findFirst({ where: { id: classificationId, tenantId } });
        if (!exists) throw new NotFoundException("FISCAL_CLASSIFICATION_NOT_FOUND");
        throw new ConflictException("FISCAL_CLASSIFICATION_UPDATE_CONFLICT");
      }
      const row = await tx.tenantFiscalClassification.findFirst({ where: { id: classificationId, tenantId } }) as TenantFiscalClassificationRecord | null;
      if (!row) throw new NotFoundException("FISCAL_CLASSIFICATION_NOT_FOUND");
      return toResponse(row);
    });
  }

  async setDefaultForCustomQuotations(
    tenantId: string,
    classificationId: string,
    isDefaultForCustomQuotations: boolean,
    actor: FiscalClassificationActor,
  ) {
    try {
      return await this.withTenantTransaction(tenantId, async (tx) => {
        const current = await tx.tenantFiscalClassification.findFirst({
          where: { id: classificationId, tenantId },
        }) as TenantFiscalClassificationRecord | null;
        if (!current) throw new NotFoundException("FISCAL_CLASSIFICATION_NOT_FOUND");
        if (isDefaultForCustomQuotations && !current.isActive) {
          throw new BadRequestException("FISCAL_CLASSIFICATION_DEFAULT_REQUIRES_ACTIVE");
        }

        if (isDefaultForCustomQuotations) {
          await tx.tenantFiscalClassification.updateMany({
            where: {
              tenantId,
              isActive: true,
              isDefaultForCustomQuotations: true,
              id: { not: classificationId },
            },
            data: {
              isDefaultForCustomQuotations: false,
              updatedByUserId: actor.userId,
              updatedByName: actor.name,
            },
          });
        }

        const updated = await tx.tenantFiscalClassification.updateMany({
          where: { id: classificationId, tenantId, updatedAt: current.updatedAt },
          data: {
            isDefaultForCustomQuotations,
            updatedByUserId: actor.userId,
            updatedByName: actor.name,
          },
        });
        if (updated.count !== 1) {
          const exists = await tx.tenantFiscalClassification.findFirst({ where: { id: classificationId, tenantId } });
          if (!exists) throw new NotFoundException("FISCAL_CLASSIFICATION_NOT_FOUND");
          throw new ConflictException("FISCAL_CLASSIFICATION_UPDATE_CONFLICT");
        }
        const row = await tx.tenantFiscalClassification.findFirst({ where: { id: classificationId, tenantId } }) as TenantFiscalClassificationRecord | null;
        if (!row) throw new NotFoundException("FISCAL_CLASSIFICATION_NOT_FOUND");
        return toResponse(row);
      });
    } catch (error) {
      if (isUniqueConstraint(error)) throw new ConflictException("FISCAL_CLASSIFICATION_DEFAULT_CONFLICT");
      throw error;
    }
  }

  async resolveDefaultCustomQuotationFiscalClassification(tenantId: string) {
    return this.withTenantTransaction(tenantId, (tx) =>
      this.resolveDefaultCustomQuotationFiscalClassificationInTransaction(tx, tenantId),
    );
  }

  async resolveDefaultCustomQuotationFiscalClassificationInTransaction(
    tx: TenantFiscalClassificationReader,
    tenantId: string,
  ): Promise<TenantFiscalClassificationRecord> {
    const classification = await tx.tenantFiscalClassification.findFirst({
      where: { tenantId, isActive: true, isDefaultForCustomQuotations: true },
    }) as TenantFiscalClassificationRecord | null;
    if (!classification) throw new NotFoundException("CUSTOM_QUOTATION_FISCAL_DEFAULT_NOT_CONFIGURED");
    return classification;
  }

  private findRecord(tenantId: string, classificationId: string) {
    return this.withTenantTransaction(tenantId, (tx) =>
      tx.tenantFiscalClassification.findFirst({ where: { id: classificationId, tenantId } }) as Promise<TenantFiscalClassificationRecord | null>,
    );
  }

  private resolveSelection(
    tenantId: string,
    input: Pick<CreateFiscalClassificationDto, "cabysCode" | "unitOfMeasureCode" | "taxCode" | "taxRateCode">,
  ) {
    return this.fiscalCatalogs.resolveFiscalSelection(tenantId, {
      cabysCode: input.cabysCode,
      unitOfMeasureCode: input.unitOfMeasureCode,
      taxCode: input.taxCode,
      taxRateCode: input.taxRateCode,
    }, true).then((selection) => {
      if (new Decimal(selection.taxPercentage).isNegative()) {
        throw new BadRequestException("FISCAL_CLASSIFICATION_TAX_PERCENTAGE_INVALID");
      }
      return selection;
    });
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: ClassificationTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

function hasFiscalIdentityUpdate(input: UpdateFiscalClassificationDto) {
  return input.cabysCode !== undefined || input.unitOfMeasureCode !== undefined || input.taxCode !== undefined || input.taxRateCode !== undefined;
}

function optionalText(value: string | null | undefined) {
  return value === undefined || value === null ? null : value.trim();
}

function isUniqueConstraint(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

function toResponse(row: TenantFiscalClassificationRecord) {
  return {
    id: row.id,
    displayName: row.displayName,
    description: row.description,
    fiscalItemCategory: row.fiscalItemCategory,
    cabysCode: row.cabysCode,
    unitOfMeasureCode: row.unitOfMeasureCode,
    taxCode: row.taxCode,
    taxRateCode: row.taxRateCode,
    taxPercentage: row.taxPercentage.toFixed(4),
    isActive: row.isActive,
    isDefaultForCustomQuotations: row.isDefaultForCustomQuotations,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: { userId: row.createdByUserId, name: row.createdByName },
    updatedBy: row.updatedByUserId ? { userId: row.updatedByUserId, name: row.updatedByName } : null,
  };
}
