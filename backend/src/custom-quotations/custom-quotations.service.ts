import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";
import { BusinessNumberingService } from "../business-numbering/business-numbering.service";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import type {
  CreateCustomQuotationDto,
  CreateCustomQuotationLineDto,
  ListLeadCustomQuotationSummariesDto,
  ListCustomQuotationsDto,
  UpdateCustomQuotationDto,
  UpdateCustomQuotationLineDto,
} from "./dto/custom-quotation.dto";

export type CustomQuotationActor = { userId: string; name: string };

type CustomQuotationTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  client: Record<string, (...args: any[]) => Promise<any>>;
  lead: Record<string, (...args: any[]) => Promise<any>>;
  customQuotation: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationVersion: Record<string, (...args: any[]) => Promise<any>>;
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
  leadId: string | null;
  customerId: string | null;
  currency: string;
  title: string;
  commercialObservations: string | null;
  quotationValidUntil: Date | null;
  paymentConditionType: string | null;
  paymentTermValue: number | null;
  paymentTermUnit: string | null;
  fiscalClassificationId: string | null;
  status: string;
  createdByUserId: string;
  createdByName: string;
  updatedByUserId: string | null;
  updatedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines?: QuotationLineRecord[];
  lead?: CommercialTargetRecord | null;
  customer?: CommercialTargetRecord | null;
};

type CommercialTargetRecord = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  companyName?: string | null;
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

type LeadQuotationSummaryRecord = {
  id: string;
  quotationNumber: string;
  title: string;
  status: string;
  currency: string;
  createdAt: Date;
  quotationValidUntil: Date | null;
  customerId: string | null;
  versions: Array<{
    id: string;
    versionNumber: number;
    status: string;
    finalSellingPrice: { toString: () => string } | string;
    createdAt: Date;
    acceptedAt: Date | null;
    rejectedAt: Date | null;
    salesOrderId: string | null;
    salesOrder: { id: string; orderNumber: string | null } | null;
  }>;
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
      const target = initialTarget(input);
      await requireTarget(tx, tenantId, target);
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
          leadId: target.type === "LEAD" ? target.id : null,
          customerId: target.type === "CUSTOMER" ? target.id : null,
          currency: input.currency,
          title: requiredText(input.title, "CUSTOM_QUOTATION_TITLE_INVALID"),
          commercialObservations: optionalText(input.commercialObservations),
          quotationValidUntil: optionalInstant(input.quotationValidUntil),
          ...terms,
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
          include: targetInclude(),
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

  async listForLead(tenantId: string, leadId: string, input: ListLeadCustomQuotationSummariesDto) {
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(25, positiveInteger(input.pageSize, 20));
    return this.withTenantTransaction(tenantId, async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id: leadId, tenantId },
        select: { id: true },
      });
      if (!lead) throw new NotFoundException("LEAD_NOT_FOUND");

      const where = { tenantId, leadId };
      const [quotations, total] = await Promise.all([
        tx.customQuotation.findMany({
          where,
          select: {
            id: true,
            quotationNumber: true,
            title: true,
            status: true,
            currency: true,
            createdAt: true,
            quotationValidUntil: true,
            customerId: true,
            versions: {
              where: { tenantId },
              orderBy: [{ versionNumber: "desc" }, { id: "desc" }],
              take: 1,
              select: {
                id: true,
                versionNumber: true,
                status: true,
                finalSellingPrice: true,
                createdAt: true,
                acceptedAt: true,
                rejectedAt: true,
                salesOrderId: true,
                salesOrder: { select: { id: true, orderNumber: true } },
              },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }) as Promise<LeadQuotationSummaryRecord[]>,
        tx.customQuotation.count({ where }) as Promise<number>,
      ]);
      return {
        items: quotations.map(toLeadQuotationSummary),
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
        include: { lines: { orderBy: [{ displayOrder: "asc" }, { id: "asc" }] }, ...targetInclude() },
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
      const target = requestedDraftTarget(input);
      if (target && targetChanged(current, target)) {
        await requireTarget(tx, tenantId, target);
        const issuedVersion = await tx.customQuotationVersion.findFirst({
          where: { tenantId, customQuotationId: quotationId },
          select: { id: true },
        });
        if (issuedVersion) throw new ConflictException("CUSTOM_QUOTATION_TARGET_LOCKED_BY_ISSUED_VERSION");
      }
      const terms = normalizePaymentTerms(input, current);
      const updated = await tx.customQuotation.updateMany({
        where: { id: quotationId, tenantId, status: "DRAFT" },
        data: {
          ...(target === null
            ? {}
            : target.type === "LEAD"
              ? { leadId: target.id, customerId: null }
              : { leadId: null, customerId: target.id }),
          ...(input.currency === undefined ? {} : { currency: input.currency }),
          ...(input.title === undefined ? {} : { title: requiredText(input.title, "CUSTOM_QUOTATION_TITLE_INVALID") }),
          ...(input.commercialObservations === undefined ? {} : { commercialObservations: optionalText(input.commercialObservations) }),
          ...(input.quotationValidUntil === undefined ? {} : { quotationValidUntil: optionalInstant(input.quotationValidUntil) }),
          ...terms,
          updatedByUserId: actor.userId,
          updatedByName: actor.name,
        },
      });
      if (updated.count !== 1) throw new ConflictException("CUSTOM_QUOTATION_DRAFT_UPDATE_CONFLICT");
      const quotation = await tx.customQuotation.findFirst({
        where: { id: quotationId, tenantId },
        include: targetInclude(),
      }) as QuotationRecord | null;
      if (!quotation) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");
      return toQuotationResponse(quotation);
    });
  }

  async addLine(tenantId: string, quotationId: string, input: CreateCustomQuotationLineDto, actor: CustomQuotationActor) {
    throw new ConflictException("CUSTOM_QUOTATION_STRUCTURED_COMPONENTS_REQUIRED");
  }

  async updateLine(tenantId: string, quotationId: string, lineId: string, input: UpdateCustomQuotationLineDto, actor: CustomQuotationActor) {
    throw new ConflictException("CUSTOM_QUOTATION_STRUCTURED_COMPONENTS_REQUIRED");
  }

  async removeLine(tenantId: string, quotationId: string, lineId: string, actor: CustomQuotationActor) {
    throw new ConflictException("CUSTOM_QUOTATION_STRUCTURED_COMPONENTS_REQUIRED");
  }

  async reorderLines(tenantId: string, quotationId: string, lineIds: string[], actor: CustomQuotationActor) {
    throw new ConflictException("CUSTOM_QUOTATION_STRUCTURED_COMPONENTS_REQUIRED");
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: CustomQuotationTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

type CommercialTargetInput = { type: "LEAD" | "CUSTOMER"; id: string };

function initialTarget(input: CreateCustomQuotationDto): CommercialTargetInput {
  const leadId = identifier(input.leadId);
  const customerId = identifier(input.customerId);
  if (Boolean(leadId) === Boolean(customerId)) {
    throw new BadRequestException(leadId || customerId
      ? "CUSTOM_QUOTATION_TARGET_EXACTLY_ONE_REQUIRED"
      : "CUSTOM_QUOTATION_TARGET_REQUIRED");
  }
  return leadId ? { type: "LEAD", id: leadId } : { type: "CUSTOMER", id: customerId! };
}

function requestedDraftTarget(input: UpdateCustomQuotationDto): CommercialTargetInput | null {
  const leadSupplied = input.leadId !== undefined;
  const customerSupplied = input.customerId !== undefined;
  if (!leadSupplied && !customerSupplied) return null;
  if (leadSupplied && customerSupplied) {
    throw new BadRequestException("CUSTOM_QUOTATION_TARGET_EXACTLY_ONE_REQUIRED");
  }
  if (leadSupplied) return { type: "LEAD", id: requiredText(input.leadId!, "CUSTOM_QUOTATION_LEAD_INVALID") };
  return { type: "CUSTOMER", id: requiredText(input.customerId!, "CUSTOM_QUOTATION_CUSTOMER_INVALID") };
}

async function requireTarget(tx: CustomQuotationTransaction, tenantId: string, target: CommercialTargetInput) {
  if (target.type === "CUSTOMER") {
    const customer = await tx.client.findFirst({ where: { id: target.id, tenantId }, select: { id: true } });
    if (!customer) throw new NotFoundException("CUSTOM_QUOTATION_CUSTOMER_NOT_FOUND");
    return;
  }
  const lead = await tx.lead.findFirst({ where: { id: target.id, tenantId }, select: { id: true, status: true } });
  if (!lead) throw new NotFoundException("CUSTOM_QUOTATION_LEAD_NOT_FOUND");
  if (lead.status !== "OPEN") throw new ConflictException("CUSTOM_QUOTATION_LEAD_NOT_OPEN");
}

function targetChanged(current: QuotationRecord, target: CommercialTargetInput) {
  return target.type === "LEAD"
    ? current.leadId !== target.id || current.customerId !== null
    : current.customerId !== target.id || current.leadId !== null;
}

function targetInclude() {
  return {
    lead: { select: { id: true, fullName: true, email: true, phone: true, companyName: true } },
    customer: { select: { id: true, fullName: true, email: true, phone: true } },
  };
}

function identifier(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
    leadId: row.leadId,
    customerId: row.customerId,
    target: targetResponse(row),
    currency: row.currency,
    title: row.title,
    commercialObservations: row.commercialObservations,
    quotationValidUntil: row.quotationValidUntil,
    paymentConditionType: row.paymentConditionType,
    paymentTermValue: row.paymentTermValue,
    paymentTermUnit: row.paymentTermUnit,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: { userId: row.createdByUserId, name: row.createdByName },
    updatedBy: row.updatedByUserId ? { userId: row.updatedByUserId, name: row.updatedByName } : null,
  };
}

function targetResponse(row: QuotationRecord) {
  const customer = row.customer;
  if (customer) {
    return {
      type: "CUSTOMER" as const,
      id: customer.id,
      displayName: customer.fullName,
      email: customer.email,
      phone: customer.phone,
      companyName: null,
    };
  }
  const lead = row.lead;
  if (lead) {
    return {
      type: "LEAD" as const,
      id: lead.id,
      displayName: lead.fullName,
      email: lead.email,
      phone: lead.phone,
      companyName: lead.companyName ?? null,
    };
  }
  return null;
}

function toQuotationDetailResponse(row: QuotationRecord) {
  return { ...toQuotationResponse(row), lines: (row.lines ?? []).map(toLineResponse) };
}

function toLeadQuotationSummary(row: LeadQuotationSummaryRecord) {
  const version = row.versions[0] ?? null;
  return {
    id: row.id,
    quotationNumber: row.quotationNumber,
    title: row.title,
    status: row.status,
    currency: row.currency,
    createdAt: row.createdAt,
    quotationValidUntil: row.quotationValidUntil,
    customerId: row.customerId,
    latestVersion: version
      ? {
          id: version.id,
          versionNumber: version.versionNumber,
          status: version.status,
          finalSellingPrice: decimalString(version.finalSellingPrice),
          createdAt: version.createdAt,
          acceptedAt: version.acceptedAt,
          rejectedAt: version.rejectedAt,
          salesOrder: salesOrderSummary(version),
        }
      : null,
  };
}

function decimalString(value: { toString: () => string } | string): string {
  return typeof value === "string" ? value : value.toString();
}

function salesOrderSummary(version: LeadQuotationSummaryRecord["versions"][number]) {
  if (!version.salesOrderId) return null;
  if (!version.salesOrder || version.salesOrder.id !== version.salesOrderId) {
    throw new ConflictException("CUSTOM_QUOTATION_VERSION_SALES_ORDER_CONFLICT");
  }
  return { id: version.salesOrder.id, orderNumber: version.salesOrder.orderNumber };
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
