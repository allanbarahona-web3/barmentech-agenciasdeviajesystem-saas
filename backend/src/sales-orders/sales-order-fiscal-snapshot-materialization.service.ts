import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { Prisma, type FiscalItemCategory } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { FiscalCatalogService } from "../fiscal-catalogs/fiscal-catalog.service";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";

const MAX_LINES = 25;
const MAX_AMOUNT = new Prisma.Decimal("99999999999999.99999");

/**
 * Immutable fiscal tuple supplied by a source adapter at Sales Order
 * materialization. SalesOrderLine stores the commercial amounts convention
 * already used by this bounded context: subtotal, VAT amount, and total.
 */
export interface FrozenFiscalSalesOrderLineInput {
  serviceCode: string;
  description: string;
  fiscalItemCategory: FiscalItemCategory;
  fiscalDescription: string;
  cabysCode: string;
  unitOfMeasureCode: string;
  taxCode: string;
  taxRateCode: string;
  fiscalTaxPercentage: Prisma.Decimal;
  fiscalClassificationId?: string | null;
  serviceDetailsVersion?: number | null;
  serviceDetails?: Prisma.InputJsonValue | null;
  commercialNotes?: string | null;
  subtotal: Prisma.Decimal;
  vatPercentage: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  participants?: Prisma.InputJsonValue;
}

export interface SourceNeutralSalesOrderMaterializationInput {
  sourceType: string;
  sourceId: string;
  customerId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  currency: "USD" | "CRC";
  commercialSubtotal: Prisma.Decimal;
  totalVat: Prisma.Decimal;
  total: Prisma.Decimal;
  paymentConditionType?: "CASH" | "CREDIT" | null;
  paymentTermValue?: number | null;
  paymentTermUnit?: "DAYS" | "MONTHS" | null;
  commercialObservations?: string | null;
  actor: { userId: string; name: string };
  lines: readonly FrozenFiscalSalesOrderLineInput[];
}

export interface SourceNeutralSalesOrderMaterializationResult {
  salesOrderId: string;
  orderNumber: string;
  reusedExisting: boolean;
}

export type SalesOrderMaterializationTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  salesOrder: Record<string, (...args: any[]) => Promise<any>>;
  client: Record<string, (...args: any[]) => Promise<any>>;
  tenantFiscalClassification: Record<string, (...args: any[]) => Promise<any>>;
};

type SalesOrderDatabase = {
  $transaction<T>(work: (transaction: SalesOrderMaterializationTransaction) => Promise<T>): Promise<T>;
};

type ExistingSalesOrder = { id: string; orderNumber: string };

@Injectable()
export class SalesOrderFiscalSnapshotMaterializationService {
  private readonly database: SalesOrderDatabase;

  constructor(
    prisma: PrismaService,
    private readonly fiscalCatalogs: FiscalCatalogService,
  ) {
    // Prisma generation follows the repository's manual migration workflow.
    this.database = prisma as unknown as SalesOrderDatabase;
  }

  async materialize(
    tenantId: string,
    input: SourceNeutralSalesOrderMaterializationInput,
  ): Promise<SourceNeutralSalesOrderMaterializationResult> {
    const normalized = normalize(input);
    const existing = await this.findExisting(tenantId, normalized.sourceType, normalized.sourceId);
    if (existing) return { salesOrderId: existing.id, orderNumber: existing.orderNumber, reusedExisting: true };

    await this.validateFiscalSelections(tenantId, normalized.lines);
    try {
      return await this.withTenantTransaction(tenantId, (tx) =>
        this.materializeNormalizedInTransaction(tx, tenantId, normalized),
      );
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      const winner = await this.findExisting(tenantId, normalized.sourceType, normalized.sourceId);
      if (!winner) throw new ConflictException("SALES_ORDER_SOURCE_MATERIALIZATION_CONFLICT");
      return { salesOrderId: winner.id, orderNumber: winner.orderNumber, reusedExisting: true };
    }
  }

  /**
   * Transaction-composable form for an approved source that must atomically
   * persist its own downstream reference with the Sales Order.
   */
  async materializeInTransaction(
    tx: SalesOrderMaterializationTransaction,
    tenantId: string,
    input: SourceNeutralSalesOrderMaterializationInput,
  ): Promise<SourceNeutralSalesOrderMaterializationResult> {
    const normalized = normalize(input);
    await this.validateFiscalSelections(tenantId, normalized.lines);
    return this.materializeNormalizedInTransaction(tx, tenantId, normalized);
  }

  private async materializeNormalizedInTransaction(
    tx: SalesOrderMaterializationTransaction,
    tenantId: string,
    normalized: NormalizedInput,
  ): Promise<SourceNeutralSalesOrderMaterializationResult> {
    const winner = await findExistingInTransaction(tx, tenantId, normalized.sourceType, normalized.sourceId);
    if (winner) return { salesOrderId: winner.id, orderNumber: winner.orderNumber, reusedExisting: true };

    await assertClassificationsBelongToTenant(tx, tenantId, normalized.lines);
    await assertCustomerBelongsToTenant(tx, tenantId, normalized.customerId);
    const orderNumber = await allocateOrderNumber(tx, tenantId);
    const salesOrderId = randomUUID();
    await tx.$executeRaw`INSERT INTO "sales_orders" (
          "id", "tenantId", "orderNumber", "status", "sourceType", "sourceId", "customerId",
          "customerName", "customerEmail", "currency", "commercialSubtotal", "totalVat", "total",
          "paymentConditionType", "paymentTermValue", "paymentTermUnit", "commercialObservations",
          "createdByUserId", "createdByName", "updatedAt"
        ) VALUES (
          ${salesOrderId}, ${tenantId}, ${orderNumber}, 'CREATED', ${normalized.sourceType}, ${normalized.sourceId}, ${normalized.customerId},
          ${normalized.customerName}, ${normalized.customerEmail}, ${normalized.currency}::"Currency", ${normalized.commercialSubtotal}, ${normalized.totalVat}, ${normalized.total},
          ${normalized.paymentConditionType}::"PaymentConditionType", ${normalized.paymentTermValue}, ${normalized.paymentTermUnit}::"PaymentTermUnit", ${normalized.commercialObservations},
          ${normalized.actor.userId}, ${normalized.actor.name}, CURRENT_TIMESTAMP
        )`;

    for (const line of normalized.lines) {
      await tx.$executeRaw`INSERT INTO "sales_order_lines" (
            "id", "tenantId", "salesOrderId", "fiscalClassificationId", "fiscalItemCategory",
            "fiscalDescription", "cabysCode", "unitOfMeasureCode", "taxCode", "taxRateCode", "fiscalTaxPercentage",
            "serviceCode", "serviceName", "serviceDetailsVersion", "serviceDetails", "commercialNotes",
            "subtotal", "vatPercentage", "vatAmount", "total", "participants", "updatedAt"
          ) VALUES (
            ${randomUUID()}, ${tenantId}, ${salesOrderId}, ${line.fiscalClassificationId}, ${line.fiscalItemCategory}::"FiscalItemCategory",
            ${line.fiscalDescription}, ${line.cabysCode}, ${line.unitOfMeasureCode}, ${line.taxCode}, ${line.taxRateCode}, ${line.fiscalTaxPercentage},
            ${line.serviceCode}, ${line.description}, ${line.serviceDetailsVersion}, ${json(line.serviceDetails)}, ${line.commercialNotes},
            ${line.subtotal}, ${line.vatPercentage}, ${line.vatAmount}, ${line.total}, ${json(line.participants)}, CURRENT_TIMESTAMP
          )`;
    }
    return { salesOrderId, orderNumber, reusedExisting: false };
  }

  private async validateFiscalSelections(
    tenantId: string,
    lines: readonly NormalizedLine[],
  ) {
    const selections = new Map<string, NormalizedLine>();
    for (const line of lines) selections.set(fiscalIdentity(line), line);
    const authoritative = await Promise.all([...selections.values()].map(async (line) => {
      const selection = await this.fiscalCatalogs.resolveFiscalSelection(tenantId, {
        cabysCode: line.cabysCode,
        unitOfMeasureCode: line.unitOfMeasureCode,
        taxCode: line.taxCode,
        taxRateCode: line.taxRateCode,
      }, false);
      return [fiscalIdentity(line), selection] as const;
    }));
    const byIdentity = new Map(authoritative);
    for (const line of lines) {
      const selection = byIdentity.get(fiscalIdentity(line));
      if (!selection || !line.fiscalTaxPercentage.equals(new Prisma.Decimal(selection.taxPercentage))) {
        throw new BadRequestException("SALES_ORDER_FISCAL_TAX_PERCENTAGE_MISMATCH");
      }
    }
  }

  private findExisting(tenantId: string, sourceType: string, sourceId: string) {
    return this.withTenantTransaction(tenantId, (tx) =>
      findExistingInTransaction(tx, tenantId, sourceType, sourceId),
    );
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: SalesOrderMaterializationTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

type NormalizedLine = Omit<FrozenFiscalSalesOrderLineInput, "participants" | "serviceDetails"> & {
  participants: Prisma.InputJsonValue;
  serviceDetails: Prisma.InputJsonValue | null;
  fiscalClassificationId: string | null;
};

type NormalizedInput = Omit<SourceNeutralSalesOrderMaterializationInput, "lines" | "customerId" | "customerEmail" | "paymentConditionType" | "paymentTermValue" | "paymentTermUnit" | "commercialObservations"> & {
  customerId: string | null;
  customerEmail: string | null;
  paymentConditionType: "CASH" | "CREDIT" | null;
  paymentTermValue: number | null;
  paymentTermUnit: "DAYS" | "MONTHS" | null;
  commercialObservations: string | null;
  lines: readonly NormalizedLine[];
};

async function findExistingInTransaction(
  tx: SalesOrderMaterializationTransaction,
  tenantId: string,
  sourceType: string,
  sourceId: string,
): Promise<ExistingSalesOrder | null> {
  return tx.salesOrder.findFirst({
    where: { tenantId, sourceType, sourceId },
    select: { id: true, orderNumber: true },
  }) as Promise<ExistingSalesOrder | null>;
}

async function assertClassificationsBelongToTenant(
  tx: SalesOrderMaterializationTransaction,
  tenantId: string,
  lines: readonly NormalizedLine[],
): Promise<void> {
  const ids = [...new Set(lines.flatMap((line) => line.fiscalClassificationId ? [line.fiscalClassificationId] : []))];
  if (ids.length === 0) return;
  const classifications = await tx.tenantFiscalClassification.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true },
  }) as Array<{ id: string }>;
  if (classifications.length !== ids.length) {
    throw new BadRequestException("SALES_ORDER_FISCAL_CLASSIFICATION_TENANT_INVALID");
  }
}

async function assertCustomerBelongsToTenant(
  tx: SalesOrderMaterializationTransaction,
  tenantId: string,
  customerId: string | null,
): Promise<void> {
  if (!customerId) return;
  const customer = await tx.client.findFirst({
    where: { id: customerId, tenantId },
    select: { id: true },
  });
  if (!customer) throw new BadRequestException("SALES_ORDER_CUSTOMER_TENANT_INVALID");
}

async function allocateOrderNumber(tx: SalesOrderMaterializationTransaction, tenantId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:SALES_ORDER_NUMBER:${year}`}, 0))`;
  const rows = await tx.$queryRaw<Array<{ next: bigint }>>`
    SELECT COALESCE(MAX(RIGHT("orderNumber", 6)::bigint), 0) + 1 AS "next"
    FROM "sales_orders"
    WHERE "tenantId" = ${tenantId} AND "orderNumber" LIKE ${`SO-${year}-%`}`;
  return `SO-${year}-${String(rows[0]?.next ?? 1).padStart(6, "0")}`;
}

function normalize(input: SourceNeutralSalesOrderMaterializationInput): NormalizedInput {
  const lines = input.lines.map(normalizeLine);
  if (lines.length === 0 || lines.length > MAX_LINES) invalid("SALES_ORDER_FISCAL_LINES_INVALID");
  const commercialSubtotal = requiredMoney(input.commercialSubtotal, "SALES_ORDER_COMMERCIAL_AMOUNT_INVALID");
  const totalVat = requiredMoney(input.totalVat, "SALES_ORDER_COMMERCIAL_AMOUNT_INVALID");
  const total = requiredMoney(input.total, "SALES_ORDER_COMMERCIAL_AMOUNT_INVALID");
  if (!commercialSubtotal.plus(totalVat).equals(total)) invalid("SALES_ORDER_COMMERCIAL_TOTAL_MISMATCH");
  const sums = lines.reduce((current, line) => ({
    subtotal: current.subtotal.plus(line.subtotal),
    vatAmount: current.vatAmount.plus(line.vatAmount),
    total: current.total.plus(line.total),
  }), { subtotal: new Prisma.Decimal(0), vatAmount: new Prisma.Decimal(0), total: new Prisma.Decimal(0) });
  if (!sums.subtotal.equals(commercialSubtotal) || !sums.vatAmount.equals(totalVat) || !sums.total.equals(total)) {
    invalid("SALES_ORDER_COMMERCIAL_TOTAL_MISMATCH");
  }
  const paymentConditionType = nullableEnum(input.paymentConditionType, ["CASH", "CREDIT"] as const, "SALES_ORDER_PAYMENT_CONDITION_INVALID");
  const paymentTermUnit = nullableEnum(input.paymentTermUnit, ["DAYS", "MONTHS"] as const, "SALES_ORDER_PAYMENT_TERM_INVALID");
  const paymentTermValue = nullablePositiveInteger(input.paymentTermValue, "SALES_ORDER_PAYMENT_TERM_INVALID");
  if ((paymentTermUnit === null) !== (paymentTermValue === null)) invalid("SALES_ORDER_PAYMENT_TERM_INVALID");
  return {
    sourceType: requiredText(input.sourceType, 100, "SALES_ORDER_SOURCE_INVALID"),
    sourceId: requiredText(input.sourceId, 100, "SALES_ORDER_SOURCE_INVALID"),
    customerId: nullableText(input.customerId, 191, "SALES_ORDER_CUSTOMER_INVALID"),
    customerName: requiredText(input.customerName, 500, "SALES_ORDER_CUSTOMER_INVALID"),
    customerEmail: nullableText(input.customerEmail, 320, "SALES_ORDER_CUSTOMER_INVALID"),
    currency: input.currency === "USD" || input.currency === "CRC" ? input.currency : invalid("SALES_ORDER_CURRENCY_INVALID"),
    commercialSubtotal,
    totalVat,
    total,
    paymentConditionType,
    paymentTermValue,
    paymentTermUnit,
    commercialObservations: nullableText(input.commercialObservations, 2000, "SALES_ORDER_OBSERVATIONS_INVALID"),
    actor: {
      userId: requiredText(input.actor?.userId, 191, "SALES_ORDER_ACTOR_INVALID"),
      name: requiredText(input.actor?.name, 500, "SALES_ORDER_ACTOR_INVALID"),
    },
    lines,
  };
}

function normalizeLine(line: FrozenFiscalSalesOrderLineInput): NormalizedLine {
  const subtotal = requiredMoney(line.subtotal, "SALES_ORDER_LINE_AMOUNT_INVALID");
  const vatAmount = requiredMoney(line.vatAmount, "SALES_ORDER_LINE_AMOUNT_INVALID");
  const total = requiredMoney(line.total, "SALES_ORDER_LINE_AMOUNT_INVALID");
  const vatPercentage = requiredPercentage(line.vatPercentage, "SALES_ORDER_LINE_TAX_INVALID");
  const fiscalTaxPercentage = requiredPercentage(line.fiscalTaxPercentage, "SALES_ORDER_FISCAL_TAX_PERCENTAGE_INVALID");
  if (!subtotal.plus(vatAmount).equals(total)) invalid("SALES_ORDER_LINE_AMOUNT_MISMATCH");
  if (line.fiscalItemCategory !== "SERVICE" && line.fiscalItemCategory !== "MERCHANDISE") {
    invalid("SALES_ORDER_FISCAL_CATEGORY_INVALID");
  }
  return {
    serviceCode: requiredText(line.serviceCode, 50, "SALES_ORDER_LINE_DESCRIPTION_INVALID"),
    description: requiredText(line.description, 500, "SALES_ORDER_LINE_DESCRIPTION_INVALID"),
    fiscalItemCategory: line.fiscalItemCategory,
    fiscalDescription: requiredText(line.fiscalDescription, 500, "SALES_ORDER_FISCAL_DESCRIPTION_INVALID"),
    cabysCode: requiredText(line.cabysCode, 13, "SALES_ORDER_FISCAL_CABYS_INVALID"),
    unitOfMeasureCode: requiredText(line.unitOfMeasureCode, 20, "SALES_ORDER_FISCAL_UNIT_INVALID"),
    taxCode: requiredText(line.taxCode, 4, "SALES_ORDER_FISCAL_TAX_INVALID"),
    taxRateCode: requiredText(line.taxRateCode, 4, "SALES_ORDER_FISCAL_TAX_INVALID"),
    fiscalTaxPercentage,
    fiscalClassificationId: nullableText(line.fiscalClassificationId, 191, "SALES_ORDER_FISCAL_CLASSIFICATION_INVALID"),
    serviceDetailsVersion: nullableNonnegativeInteger(line.serviceDetailsVersion, "SALES_ORDER_LINE_DETAILS_INVALID"),
    serviceDetails: line.serviceDetails ?? null,
    commercialNotes: nullableText(line.commercialNotes, 2000, "SALES_ORDER_LINE_NOTES_INVALID"),
    subtotal,
    vatPercentage,
    vatAmount,
    total,
    participants: line.participants ?? [],
  };
}

function fiscalIdentity(line: Pick<NormalizedLine, "cabysCode" | "unitOfMeasureCode" | "taxCode" | "taxRateCode">) {
  return `${line.cabysCode}:${line.unitOfMeasureCode}:${line.taxCode}:${line.taxRateCode}`;
}

function requiredMoney(value: unknown, code: string) {
  if (!(value instanceof Prisma.Decimal) || !value.isFinite() || value.isNegative() || value.decimalPlaces() > 5 || value.greaterThan(MAX_AMOUNT)) invalid(code);
  return value;
}

function requiredPercentage(value: unknown, code: string) {
  if (!(value instanceof Prisma.Decimal) || !value.isFinite() || value.isNegative() || value.decimalPlaces() > 4 || value.greaterThan(100)) invalid(code);
  return value;
}

function requiredText(value: unknown, maximum: number, code: string) {
  const text = nullableText(value, maximum, code);
  if (text === null) invalid(code);
  return text;
}

function nullableText(value: unknown, maximum: number, code: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") invalid(code);
  const text = value.trim();
  if (!text || text.length > maximum) invalid(code);
  return text;
}

function nullablePositiveInteger(value: unknown, code: string) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || (value as number) <= 0) invalid(code);
  return value as number;
}

function nullableNonnegativeInteger(value: unknown, code: string) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 0) invalid(code);
  return value as number;
}

function nullableEnum<T extends string>(value: unknown, allowed: readonly T[], code: string): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid(code);
  return value as T;
}

function json(value: Prisma.InputJsonValue | null) {
  return JSON.stringify(value ?? null);
}

function isUniqueConstraint(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error &&
    ((error as { code?: unknown }).code === "P2002" || (error as { code?: unknown }).code === "23505");
}

function invalid(code: string): never {
  throw new BadRequestException(code);
}
