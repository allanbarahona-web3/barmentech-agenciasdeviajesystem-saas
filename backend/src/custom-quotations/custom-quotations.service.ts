import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";
import { BusinessNumberingService } from "../business-numbering/business-numbering.service";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import type {
  CreateCustomQuotationDto,
  CreateCustomQuotationLineDto,
  ListCustomQuotationsDto,
  UpdateCustomQuotationDto,
  UpdateCustomQuotationLineDto,
} from "./dto/custom-quotation.dto";

export type CustomQuotationActor = { userId: string; name: string };

type CustomQuotationTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  client: Record<string, (...args: any[]) => Promise<any>>;
  tenantFiscalClassification: Record<string, (...args: any[]) => Promise<any>>;
  customQuotation: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationLine: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationCostingProjectLink: Record<string, (...args: any[]) => Promise<any>>;
};

type CustomQuotationDatabase = {
  $transaction<T>(work: (transaction: CustomQuotationTransaction) => Promise<T>): Promise<T>;
};

type QuotationRecord = {
  id: string;
  tenantId: string;
  quotationNumber: string;
  customerId: string;
  currency: string;
  title: string;
  commercialObservations: string | null;
  quotationValidUntil: Date | null;
  paymentConditionType: string | null;
  paymentTermValue: number | null;
  paymentTermUnit: string | null;
  fiscalClassificationId: string;
  status: string;
  createdByUserId: string;
  createdByName: string;
  updatedByUserId: string | null;
  updatedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines?: QuotationLineRecord[];
};

type QuotationLineRecord = {
  id: string;
  tenantId: string;
  customQuotationId: string;
  displayOrder: number;
  description: string;
  quantity: { toFixed: (digits?: number) => string };
  commercialNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const CUSTOM_QUOTATION_SEQUENCE_KEY = "CUSTOM_QUOTATION";

@Injectable()
export class CustomQuotationsService {
  private readonly database: CustomQuotationDatabase;

  constructor(
    prisma: PrismaService,
    private readonly businessNumbers: BusinessNumberingService,
  ) {
    // Prisma generation is manual; the new schema delegates are used through
    // the same transaction-scoped runtime contract as other new foundations.
    this.database = prisma as unknown as CustomQuotationDatabase;
  }

  async create(tenantId: string, input: CreateCustomQuotationDto, actor: CustomQuotationActor) {
    const terms = normalizePaymentTerms(input);
    return this.withTenantTransaction(tenantId, async (tx) => {
      await requireCustomer(tx, tenantId, input.customerId);
      await requireActiveClassification(tx, tenantId, input.fiscalClassificationId);
      const now = new Date();
      const sequence = await this.businessNumbers.next(tx as never, {
        tenantId,
        sequenceKey: CUSTOM_QUOTATION_SEQUENCE_KEY,
        year: now.getUTCFullYear(),
      });
      const quotation = await tx.customQuotation.create({
        data: {
          tenantId,
          quotationNumber: quotationNumber(now.getUTCFullYear(), sequence),
          customerId: input.customerId,
          currency: input.currency,
          title: requiredText(input.title, "CUSTOM_QUOTATION_TITLE_INVALID"),
          commercialObservations: optionalText(input.commercialObservations),
          quotationValidUntil: optionalInstant(input.quotationValidUntil),
          ...terms,
          fiscalClassificationId: input.fiscalClassificationId,
          status: "DRAFT",
          createdByUserId: actor.userId,
          createdByName: actor.name,
        },
      }) as QuotationRecord;
      return toQuotationResponse(quotation);
    });
  }

  list(tenantId: string, input: ListCustomQuotationsDto) {
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(25, positiveInteger(input.pageSize, 20));
    const search = optionalText(input.search);
    return this.withTenantTransaction(tenantId, async (tx) => {
      const where = {
        tenantId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.customerId ? { customerId: input.customerId } : {}),
        ...(search ? {
          OR: [
            { quotationNumber: { contains: search, mode: "insensitive" } },
            { title: { contains: search, mode: "insensitive" } },
          ],
        } : {}),
      };
      const [quotations, total] = await Promise.all([
        tx.customQuotation.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }) as Promise<QuotationRecord[]>,
        tx.customQuotation.count({ where }) as Promise<number>,
      ]);
      return {
        items: quotations.map(toQuotationResponse),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    });
  }

  async find(tenantId: string, quotationId: string) {
    const quotation = await this.withTenantTransaction(tenantId, (tx) =>
      tx.customQuotation.findFirst({
        where: { id: quotationId, tenantId },
        include: { lines: { orderBy: [{ displayOrder: "asc" }, { id: "asc" }] } },
      }) as Promise<QuotationRecord | null>,
    );
    if (!quotation) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");
    return toQuotationDetailResponse(quotation);
  }

  async update(tenantId: string, quotationId: string, input: UpdateCustomQuotationDto, actor: CustomQuotationActor) {
    if (Object.keys(input).length === 0) throw new BadRequestException("CUSTOM_QUOTATION_UPDATE_EMPTY");
    return this.withTenantTransaction(tenantId, async (tx) => {
      const current = await requireDraft(tx, tenantId, quotationId);
      if (input.currency !== undefined && input.currency !== current.currency) {
        const costingLink = await tx.customQuotationCostingProjectLink.findFirst({
          where: { tenantId, customQuotationId: quotationId },
          select: { id: true },
        });
        if (costingLink) throw new ConflictException("CUSTOM_QUOTATION_CURRENCY_LOCKED_BY_COSTING_PROJECT");
      }
      if (input.customerId !== undefined) await requireCustomer(tx, tenantId, input.customerId);
      if (input.fiscalClassificationId !== undefined) await requireActiveClassification(tx, tenantId, input.fiscalClassificationId);
      const terms = normalizePaymentTerms(input, current);
      const updated = await tx.customQuotation.updateMany({
        where: { id: quotationId, tenantId, status: "DRAFT" },
        data: {
          ...(input.customerId === undefined ? {} : { customerId: input.customerId }),
          ...(input.currency === undefined ? {} : { currency: input.currency }),
          ...(input.title === undefined ? {} : { title: requiredText(input.title, "CUSTOM_QUOTATION_TITLE_INVALID") }),
          ...(input.commercialObservations === undefined ? {} : { commercialObservations: optionalText(input.commercialObservations) }),
          ...(input.quotationValidUntil === undefined ? {} : { quotationValidUntil: optionalInstant(input.quotationValidUntil) }),
          ...(input.fiscalClassificationId === undefined ? {} : { fiscalClassificationId: input.fiscalClassificationId }),
          ...terms,
          updatedByUserId: actor.userId,
          updatedByName: actor.name,
        },
      });
      if (updated.count !== 1) throw new ConflictException("CUSTOM_QUOTATION_DRAFT_UPDATE_CONFLICT");
      const quotation = await tx.customQuotation.findFirst({ where: { id: quotationId, tenantId } }) as QuotationRecord | null;
      if (!quotation) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");
      return toQuotationResponse(quotation);
    });
  }

  addLine(tenantId: string, quotationId: string, input: CreateCustomQuotationLineDto, actor: CustomQuotationActor) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      await requireDraft(tx, tenantId, quotationId);
      const last = await tx.customQuotationLine.findFirst({
        where: { tenantId, customQuotationId: quotationId },
        orderBy: [{ displayOrder: "desc" }, { id: "desc" }],
        select: { displayOrder: true },
      }) as { displayOrder: number } | null;
      const line = await tx.customQuotationLine.create({
        data: {
          tenantId,
          customQuotationId: quotationId,
          displayOrder: (last?.displayOrder ?? 0) + 1,
          description: requiredText(input.description, "CUSTOM_QUOTATION_LINE_DESCRIPTION_INVALID"),
          quantity: positiveQuantity(input.quantity ?? "1"),
          commercialNote: optionalText(input.commercialNote),
        },
      }) as QuotationLineRecord;
      await touchQuotation(tx, tenantId, quotationId, actor);
      return toLineResponse(line);
    });
  }

  updateLine(tenantId: string, quotationId: string, lineId: string, input: UpdateCustomQuotationLineDto, actor: CustomQuotationActor) {
    if (Object.keys(input).length === 0) throw new BadRequestException("CUSTOM_QUOTATION_LINE_UPDATE_EMPTY");
    return this.withTenantTransaction(tenantId, async (tx) => {
      await requireDraft(tx, tenantId, quotationId);
      const updated = await tx.customQuotationLine.updateMany({
        where: { id: lineId, tenantId, customQuotationId: quotationId },
        data: {
          ...(input.description === undefined ? {} : { description: requiredText(input.description, "CUSTOM_QUOTATION_LINE_DESCRIPTION_INVALID") }),
          ...(input.quantity === undefined ? {} : { quantity: positiveQuantity(input.quantity) }),
          ...(input.commercialNote === undefined ? {} : { commercialNote: optionalText(input.commercialNote) }),
        },
      });
      if (updated.count !== 1) throw new NotFoundException("CUSTOM_QUOTATION_LINE_NOT_FOUND");
      const line = await tx.customQuotationLine.findFirst({ where: { id: lineId, tenantId, customQuotationId: quotationId } }) as QuotationLineRecord | null;
      if (!line) throw new NotFoundException("CUSTOM_QUOTATION_LINE_NOT_FOUND");
      await touchQuotation(tx, tenantId, quotationId, actor);
      return toLineResponse(line);
    });
  }

  removeLine(tenantId: string, quotationId: string, lineId: string, actor: CustomQuotationActor) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      await requireDraft(tx, tenantId, quotationId);
      const line = await tx.customQuotationLine.findFirst({ where: { id: lineId, tenantId, customQuotationId: quotationId } }) as QuotationLineRecord | null;
      if (!line) throw new NotFoundException("CUSTOM_QUOTATION_LINE_NOT_FOUND");
      await tx.customQuotationLine.deleteMany({ where: { id: lineId, tenantId, customQuotationId: quotationId } });
      await tx.customQuotationLine.updateMany({
        where: { tenantId, customQuotationId: quotationId, displayOrder: { gt: line.displayOrder } },
        data: { displayOrder: { decrement: 1 } },
      });
      await touchQuotation(tx, tenantId, quotationId, actor);
    });
  }

  reorderLines(tenantId: string, quotationId: string, lineIds: string[], actor: CustomQuotationActor) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      await requireDraft(tx, tenantId, quotationId);
      if (new Set(lineIds).size !== lineIds.length) throw new BadRequestException("CUSTOM_QUOTATION_LINE_REORDER_DUPLICATE");
      const lines = await tx.customQuotationLine.findMany({
        where: { tenantId, customQuotationId: quotationId },
        orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      }) as QuotationLineRecord[];
      if (lineIds.length !== lines.length || !lineIds.every((lineId) => lines.some((line) => line.id === lineId))) {
        throw new BadRequestException("CUSTOM_QUOTATION_LINE_REORDER_INVALID");
      }
      // Move every order out of the unique range before assigning its new one.
      await tx.customQuotationLine.updateMany({
        where: { tenantId, customQuotationId: quotationId },
        data: { displayOrder: { increment: lines.length } },
      });
      await Promise.all(lineIds.map((lineId, index) => tx.customQuotationLine.updateMany({
        where: { id: lineId, tenantId, customQuotationId: quotationId },
        data: { displayOrder: index + 1 },
      })));
      await touchQuotation(tx, tenantId, quotationId, actor);
      return { lineIds };
    });
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: CustomQuotationTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

async function requireCustomer(tx: CustomQuotationTransaction, tenantId: string, customerId: string) {
  const customer = await tx.client.findFirst({ where: { id: customerId, tenantId }, select: { id: true } });
  if (!customer) throw new NotFoundException("CUSTOM_QUOTATION_CUSTOMER_NOT_FOUND");
}

async function requireActiveClassification(tx: CustomQuotationTransaction, tenantId: string, fiscalClassificationId: string) {
  const classification = await tx.tenantFiscalClassification.findFirst({ where: { id: fiscalClassificationId, tenantId }, select: { id: true, isActive: true } });
  if (!classification) throw new NotFoundException("CUSTOM_QUOTATION_FISCAL_CLASSIFICATION_NOT_FOUND");
  if (!classification.isActive) throw new BadRequestException("CUSTOM_QUOTATION_FISCAL_CLASSIFICATION_INACTIVE");
}

async function requireDraft(tx: CustomQuotationTransaction, tenantId: string, quotationId: string) {
  const quotation = await tx.customQuotation.findFirst({ where: { id: quotationId, tenantId } }) as QuotationRecord | null;
  if (!quotation) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");
  if (quotation.status !== "DRAFT") throw new ConflictException("CUSTOM_QUOTATION_NOT_DRAFT");
  return quotation;
}

function touchQuotation(tx: CustomQuotationTransaction, tenantId: string, quotationId: string, actor: CustomQuotationActor) {
  return tx.customQuotation.updateMany({
    where: { id: quotationId, tenantId, status: "DRAFT" },
    data: { updatedByUserId: actor.userId, updatedByName: actor.name },
  });
}

function normalizePaymentTerms(input: CreateCustomQuotationDto | UpdateCustomQuotationDto, current?: QuotationRecord) {
  const condition = input.paymentConditionType === undefined ? current?.paymentConditionType ?? null : input.paymentConditionType;
  const value = input.paymentTermValue === undefined ? current?.paymentTermValue ?? null : input.paymentTermValue;
  const unit = input.paymentTermUnit === undefined ? current?.paymentTermUnit ?? null : input.paymentTermUnit;
  if (condition === null) {
    if (value !== null || unit !== null) throw new BadRequestException("CUSTOM_QUOTATION_PAYMENT_TERMS_INVALID");
    return { paymentConditionType: null, paymentTermValue: null, paymentTermUnit: null };
  }
  if (condition === "CASH") {
    if ((input.paymentTermValue !== undefined && input.paymentTermValue !== null) || (input.paymentTermUnit !== undefined && input.paymentTermUnit !== null)) {
      throw new BadRequestException("CUSTOM_QUOTATION_PAYMENT_TERMS_INVALID");
    }
    return { paymentConditionType: condition, paymentTermValue: null, paymentTermUnit: null };
  }
  if (condition !== "CREDIT" || typeof value !== "number" || !Number.isInteger(value) || value < 1 || !unit) {
    throw new BadRequestException("CUSTOM_QUOTATION_PAYMENT_TERMS_INVALID");
  }
  return { paymentConditionType: condition, paymentTermValue: value, paymentTermUnit: unit };
}

function quotationNumber(year: number, sequence: bigint) {
  return `CQ-${year}-${sequence.toString().padStart(6, "0")}`;
}

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function requiredText(value: string, errorCode: string) {
  const normalized = value.trim();
  if (!normalized) throw new BadRequestException(errorCode);
  return normalized;
}

function optionalText(value: string | null | undefined) {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function optionalInstant(value: string | null | undefined) {
  if (value === undefined || value === null) return null;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new BadRequestException("CUSTOM_QUOTATION_VALID_UNTIL_INVALID");
  return instant;
}

function positiveQuantity(value: string) {
  const quantity = new Decimal(value);
  if (!quantity.gt(0)) throw new BadRequestException("CUSTOM_QUOTATION_LINE_QUANTITY_INVALID");
  return quantity;
}

function toQuotationResponse(row: QuotationRecord) {
  return {
    id: row.id,
    quotationNumber: row.quotationNumber,
    customerId: row.customerId,
    currency: row.currency,
    title: row.title,
    commercialObservations: row.commercialObservations,
    quotationValidUntil: row.quotationValidUntil,
    paymentConditionType: row.paymentConditionType,
    paymentTermValue: row.paymentTermValue,
    paymentTermUnit: row.paymentTermUnit,
    fiscalClassificationId: row.fiscalClassificationId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: { userId: row.createdByUserId, name: row.createdByName },
    updatedBy: row.updatedByUserId ? { userId: row.updatedByUserId, name: row.updatedByName } : null,
  };
}

function toQuotationDetailResponse(row: QuotationRecord) {
  return { ...toQuotationResponse(row), lines: (row.lines ?? []).map(toLineResponse) };
}

function toLineResponse(row: QuotationLineRecord) {
  return {
    id: row.id,
    displayOrder: row.displayOrder,
    description: row.description,
    quantity: row.quantity.toFixed(4),
    commercialNote: row.commercialNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
