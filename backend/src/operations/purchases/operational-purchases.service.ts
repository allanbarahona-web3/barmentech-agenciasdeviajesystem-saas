import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { FINANCE_ELIGIBILITY_READER, type FinanceEligibilityReader } from "../../finance/eligibility-read/finance-eligibility-reader.port";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import { procurementAuthorizationForRequirement } from "../operational-procurement-authorization";
import { CreateOperationalPurchaseDto, ListOperationalPurchasesDto, UpdateOperationalPurchaseDto } from "./dto/operational-purchases.dto";

export type OperationalPurchasesActor = { userId: string; name: string };
type Tx = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  operationalRequirement: Record<string, (...args: any[]) => Promise<any>>;
  operationalFulfillment: Record<string, (...args: any[]) => Promise<any>>;
  operationalPurchase: Record<string, (...args: any[]) => Promise<any>>;
};
type Database = { $transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> };
type Requirement = { id: string; travelPackageId: string; status: string; sourceType: string; sourceId: string | null; sourceLineId: string | null; sourceVersionId: string | null };
type Fulfillment = { id: string; status: "DRAFT" | "RESERVED" | "PURCHASED" | "CONFIRMED" | "CANCELLED" };
type Purchase = {
  id: string; travelPackageId: string; operationalFulfillmentId: string; providerName: string; supplierReference: string | null;
  amount: Prisma.Decimal; currency: string; taxAmount: Prisma.Decimal | null; purchasedAt: Date; supplierInvoiceNumber: string | null;
  notes: string | null; createdByUserId: string; createdByName: string; createdAt: Date; updatedAt: Date;
};

const PURCHASE_SELECT = { id: true, travelPackageId: true, operationalFulfillmentId: true, providerName: true, supplierReference: true, amount: true, currency: true, taxAmount: true, purchasedAt: true, supplierInvoiceNumber: true, notes: true, createdByUserId: true, createdByName: true, createdAt: true, updatedAt: true } as const;

@Injectable()
export class OperationalPurchasesService {
  private readonly database: Database;
  constructor(prisma: PrismaService, @Inject(FINANCE_ELIGIBILITY_READER) private readonly financeEligibility: FinanceEligibilityReader) {
    this.database = prisma as unknown as Database;
  }

  async list(tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string, input: ListOperationalPurchasesDto) {
    const page = integer(input.page, 1), pageSize = pageSizeValue(input.pageSize);
    const where = {
      tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId,
      ...(input.currency === undefined ? {} : { currency: input.currency.trim().toUpperCase() }),
      ...(input.providerSearch === undefined ? {} : { providerName: { contains: input.providerSearch.trim(), mode: "insensitive" } }),
    };
    return this.withTransaction(tenantId, async (tx) => {
      await this.requireFulfillment(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
      const [items, total] = await Promise.all([
        tx.operationalPurchase.findMany({ where, select: PURCHASE_SELECT, orderBy: [{ purchasedAt: "desc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }) as Promise<Purchase[]>,
        tx.operationalPurchase.count({ where }) as Promise<number>,
      ]);
      return { items: items.map(toResponse), total, page, pageSize, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
    });
  }

  async find(tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string, purchaseId: string) {
    return this.withTransaction(tenantId, async (tx) => {
      const purchase = await this.findPurchase(tx, tenantId, travelPackageId, requirementId, fulfillmentId, purchaseId);
      if (!purchase) throw new NotFoundException("OPERATIONAL_PURCHASE_NOT_FOUND");
      return toResponse(purchase);
    });
  }

  async create(tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string, input: CreateOperationalPurchaseDto, actor: OperationalPurchasesActor) {
    const fields = createFields(input);
    const initial = await this.withTransaction(tenantId, (tx) => this.requireMutableParent(tx, tenantId, travelPackageId, requirementId, fulfillmentId));
    await this.requireProcurementAuthorization(tenantId, initial.requirement);
    return this.withTransaction(tenantId, async (tx) => {
      const parent = await this.requireMutableParent(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
      const requirementLocked = await tx.operationalRequirement.updateMany({
        where: { id: requirementId, tenantId, travelPackageId, status: parent.requirement.status },
        data: { status: parent.requirement.status, updatedByUserId: actor.userId, updatedByName: actor.name },
      });
      if (requirementLocked.count !== 1) {
        await this.requireMutableParent(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
        throw new ConflictException("OPERATIONAL_PURCHASE_REQUIREMENT_STATE_CONFLICT");
      }
      const nextFulfillmentStatus = parent.fulfillment.status === "DRAFT" || parent.fulfillment.status === "RESERVED"
        ? "PURCHASED"
        : parent.fulfillment.status;
      const locked = await tx.operationalFulfillment.updateMany({
        where: { id: fulfillmentId, tenantId, travelPackageId, operationalRequirementId: requirementId, status: parent.fulfillment.status },
        data: { status: nextFulfillmentStatus, updatedByUserId: actor.userId, updatedByName: actor.name },
      });
      if (locked.count !== 1) {
        await this.requireMutableParent(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
        throw new ConflictException("OPERATIONAL_PURCHASE_FULFILLMENT_STATE_CONFLICT");
      }
      const created = await tx.operationalPurchase.create({
        data: { tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId, ...fields, createdByUserId: actor.userId, createdByName: actor.name },
        select: PURCHASE_SELECT,
      }) as Purchase;
      return toResponse(created);
    });
  }

  async update(tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string, purchaseId: string, input: UpdateOperationalPurchaseDto, actor: OperationalPurchasesActor) {
    if (input.supplierReference === undefined && input.supplierInvoiceNumber === undefined && input.notes === undefined) throw new BadRequestException("OPERATIONAL_PURCHASE_UPDATE_EMPTY");
    return this.withTransaction(tenantId, async (tx) => {
      await this.requireMutableParent(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
      const existing = await this.findPurchase(tx, tenantId, travelPackageId, requirementId, fulfillmentId, purchaseId);
      if (!existing) throw new NotFoundException("OPERATIONAL_PURCHASE_NOT_FOUND");
      const updated = await tx.operationalPurchase.updateMany({
        where: { id: purchaseId, tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId },
        data: {
          ...(input.supplierReference === undefined ? {} : { supplierReference: textOrNull(input.supplierReference, "OPERATIONAL_PURCHASE_SUPPLIER_REFERENCE_INVALID") }),
          ...(input.supplierInvoiceNumber === undefined ? {} : { supplierInvoiceNumber: textOrNull(input.supplierInvoiceNumber, "OPERATIONAL_PURCHASE_INVOICE_INVALID") }),
          ...(input.notes === undefined ? {} : { notes: textOrNull(input.notes, "OPERATIONAL_PURCHASE_NOTES_INVALID") }),
          updatedByUserId: actor.userId, updatedByName: actor.name,
        },
      });
      if (updated.count !== 1) throw new NotFoundException("OPERATIONAL_PURCHASE_NOT_FOUND");
      const purchase = await this.findPurchase(tx, tenantId, travelPackageId, requirementId, fulfillmentId, purchaseId);
      if (!purchase) throw new NotFoundException("OPERATIONAL_PURCHASE_NOT_FOUND");
      return toResponse(purchase);
    });
  }

  private async requireMutableParent(tx: Tx, tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string) {
    const requirement = await this.requireRequirement(tx, tenantId, travelPackageId, requirementId);
    if (requirement.status === "CANCELLED" || requirement.status === "NOT_APPLICABLE") throw new ConflictException("OPERATIONAL_PURCHASE_PARENT_REQUIREMENT_TERMINAL");
    const fulfillment = await this.requireFulfillment(tx, tenantId, travelPackageId, requirementId, fulfillmentId);
    if (fulfillment.status === "CANCELLED") throw new ConflictException("OPERATIONAL_PURCHASE_FULFILLMENT_CANCELLED");
    if (fulfillment.status === "CONFIRMED") throw new ConflictException("OPERATIONAL_PURCHASE_FULFILLMENT_CONFIRMED");
    return { requirement, fulfillment };
  }

  private async requireRequirement(tx: Tx, tenantId: string, travelPackageId: string, requirementId: string): Promise<Requirement> {
    const requirement = await tx.operationalRequirement.findFirst({ where: { id: requirementId, tenantId, travelPackageId }, select: { id: true, travelPackageId: true, status: true, sourceType: true, sourceId: true, sourceLineId: true, sourceVersionId: true } }) as Requirement | null;
    if (!requirement) throw new NotFoundException("OPERATIONAL_REQUIREMENT_NOT_FOUND");
    return requirement;
  }

  private async requireFulfillment(tx: Tx, tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string): Promise<Fulfillment> {
    const fulfillment = await tx.operationalFulfillment.findFirst({ where: { id: fulfillmentId, tenantId, travelPackageId, operationalRequirementId: requirementId }, select: { id: true, status: true } }) as Fulfillment | null;
    if (!fulfillment) throw new NotFoundException("OPERATIONAL_FULFILLMENT_NOT_FOUND");
    return fulfillment;
  }

  private findPurchase(tx: Tx, tenantId: string, travelPackageId: string, requirementId: string, fulfillmentId: string, purchaseId: string): Promise<Purchase | null> {
    return tx.operationalPurchase.findFirst({
      where: { id: purchaseId, tenantId, travelPackageId, operationalFulfillmentId: fulfillmentId, operationalFulfillment: { operationalRequirementId: requirementId } },
      select: PURCHASE_SELECT,
    }) as Promise<Purchase | null>;
  }

  private async requireProcurementAuthorization(tenantId: string, requirement: Requirement) {
    const authorization = procurementAuthorizationForRequirement(requirement);
    if (authorization.kind === "AUTHORIZED_BY_SOURCE_POLICY") return;
    if (authorization.kind === "UNAVAILABLE") throw new ConflictException("OPERATIONAL_PURCHASE_FINANCIAL_ELIGIBILITY_UNAVAILABLE");
    let result;
    try { [result] = await this.financeEligibility.readMany({ tenantId, sources: [authorization.source] }); }
    catch { throw new ConflictException("OPERATIONAL_PURCHASE_FINANCIAL_ELIGIBILITY_UNAVAILABLE"); }
    if (!result || result.eligibility !== "ELIGIBLE") {
      if (!result || result.reason === "FINANCIAL_DATA_MISSING") throw new ConflictException("OPERATIONAL_PURCHASE_FINANCIAL_ELIGIBILITY_UNAVAILABLE");
      throw new ConflictException("OPERATIONAL_PURCHASE_FINANCIAL_ELIGIBILITY_BLOCKED");
    }
  }

  private withTransaction<T>(tenantId: string, work: (tx: Tx) => Promise<T>) { return runTenantTransaction(this.database, tenantId, work); }
}

function createFields(input: CreateOperationalPurchaseDto) {
  const providerName = text(input.providerName, "OPERATIONAL_PURCHASE_PROVIDER_INVALID");
  const amount = decimal(input.amount, "OPERATIONAL_PURCHASE_AMOUNT_INVALID", true);
  const taxAmount = input.taxAmount === undefined || input.taxAmount === null ? null : decimal(input.taxAmount, "OPERATIONAL_PURCHASE_TAX_AMOUNT_INVALID", false);
  const currency = typeof input.currency === "string" ? input.currency.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException("OPERATIONAL_PURCHASE_CURRENCY_INVALID");
  const purchasedAt = date(input.purchasedAt, "OPERATIONAL_PURCHASE_PURCHASED_AT_INVALID");
  return { providerName, supplierReference: textOrNull(input.supplierReference, "OPERATIONAL_PURCHASE_SUPPLIER_REFERENCE_INVALID"), amount, currency, taxAmount, purchasedAt, supplierInvoiceNumber: textOrNull(input.supplierInvoiceNumber, "OPERATIONAL_PURCHASE_INVOICE_INVALID"), notes: textOrNull(input.notes, "OPERATIONAL_PURCHASE_NOTES_INVALID") };
}
function text(value: unknown, code: string) { const normalized = typeof value === "string" ? value.trim() : ""; if (!normalized) throw new BadRequestException(code); return normalized; }
function textOrNull(value: unknown, code: string): string | null { if (value === undefined || value === null) return null; return text(value, code); }
function decimal(value: unknown, code: string, positive: boolean) { try { const parsed = new Prisma.Decimal(String(value)); const max = new Prisma.Decimal("99999999999999.99999"); if (!parsed.isFinite() || parsed.isNegative() || (positive && parsed.isZero()) || parsed.greaterThan(max)) throw new Error(); return parsed; } catch { throw new BadRequestException(code); } }
function date(value: unknown, code: string) { if (typeof value !== "string") throw new BadRequestException(code); const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) throw new BadRequestException(code); return parsed; }
function integer(value: number | undefined, fallback: number) { return Number.isInteger(value) && value! > 0 ? value! : fallback; }
function pageSizeValue(value: number | undefined) { if (value === undefined) return 20; if (!Number.isInteger(value) || value < 1 || value > 25) throw new BadRequestException("OPERATIONAL_PURCHASE_PAGE_SIZE_INVALID"); return value; }
function toResponse(purchase: Purchase) { return { id: purchase.id, fulfillmentId: purchase.operationalFulfillmentId, travelPackageId: purchase.travelPackageId, providerName: purchase.providerName, supplierReference: purchase.supplierReference, amount: purchase.amount.toFixed(), currency: purchase.currency, taxAmount: purchase.taxAmount?.toFixed() ?? null, purchasedAt: purchase.purchasedAt, supplierInvoiceNumber: purchase.supplierInvoiceNumber, notes: purchase.notes, createdBy: { userId: purchase.createdByUserId, name: purchase.createdByName }, createdAt: purchase.createdAt, updatedAt: purchase.updatedAt }; }
