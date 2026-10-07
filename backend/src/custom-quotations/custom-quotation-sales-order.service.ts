import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  SalesOrderSourceMaterializationService,
} from "../sales-orders/sales-order-source-materialization.service";
import type { SalesOrderMaterializationTransaction } from "../sales-orders/sales-order-fiscal-snapshot-materialization.service";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import { CustomQuotationOperationsIntakeOutboxProducer } from "./custom-quotation-operations-intake-outbox.producer";
import type { CustomQuotationActor } from "./custom-quotations.service";

const SOURCE_TYPE = "CUSTOM_QUOTATION_VERSION";
const SERVICE_CODE = "CUSTOM_QUOTATION";
const HUNDRED = new Prisma.Decimal("100");
const MAX_SALES_ORDER_LINES = 25;

type CustomQuotationSalesOrderTransaction = SalesOrderMaterializationTransaction & {
  customQuotation: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationVersion: Record<string, (...args: any[]) => Promise<any>>;
};

type CustomQuotationSalesOrderDatabase = {
  $transaction<T>(work: (transaction: CustomQuotationSalesOrderTransaction) => Promise<T>): Promise<T>;
};

@Injectable()
export class CustomQuotationSalesOrderService {
  private readonly database: CustomQuotationSalesOrderDatabase;

  constructor(
    prisma: PrismaService,
    private readonly salesOrders: SalesOrderSourceMaterializationService,
    private readonly operationsIntakeOutboxProducer: CustomQuotationOperationsIntakeOutboxProducer,
  ) {
    this.database = prisma as unknown as CustomQuotationSalesOrderDatabase;
  }

  async materialize(
    tenantId: string,
    quotationId: string,
    versionId: string,
    actor: CustomQuotationActor,
  ) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      await lockQuotation(tx, tenantId, quotationId);
      await lockVersion(tx, tenantId, quotationId, versionId);

      const version = await tx.customQuotationVersion.findFirst({
        where: { id: versionId, tenantId, customQuotationId: quotationId },
        select: {
          id: true,
          customQuotationId: true,
          status: true,
          currency: true,
          finalSellingPrice: true,
          paymentConditionType: true,
          paymentTermValue: true,
          paymentTermUnit: true,
          commercialObservations: true,
          fiscalClassificationId: true,
          fiscalDescription: true,
          fiscalItemCategory: true,
          cabysCode: true,
          unitOfMeasureCode: true,
          taxCode: true,
          taxRateCode: true,
          fiscalTaxPercentage: true,
          salesOrderId: true,
          lines: {
            orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
            select: {
              id: true,
              soldAmount: true,
              description: true,
              commercialNote: true,
              fiscalClassificationId: true,
              fiscalDescription: true,
              fiscalItemCategory: true,
              cabysCode: true,
              unitOfMeasureCode: true,
              taxCode: true,
              taxRateCode: true,
              fiscalTaxPercentage: true,
            },
          },
          customQuotation: {
            select: {
              id: true,
              status: true,
              customerId: true,
              customer: { select: { fullName: true, email: true } },
            },
          },
        },
      });
      if (!version) throw new NotFoundException("CUSTOM_QUOTATION_VERSION_NOT_FOUND");
      if (version.status !== "ACCEPTED" || version.customQuotation.status !== "ACCEPTED") {
        throw new ConflictException("CUSTOM_QUOTATION_VERSION_NOT_ACCEPTED");
      }
      if (!version.customQuotation.customerId) {
        throw new ConflictException("CUSTOM_QUOTATION_CUSTOMER_REQUIRED_FOR_SALES_ORDER");
      }
      validateVersionSnapshot(version);

      if (version.salesOrderId) {
        const existing = await tx.salesOrder.findFirst({
          where: { id: version.salesOrderId, tenantId },
          select: { id: true, orderNumber: true, sourceType: true, sourceId: true },
        });
        if (!existing || existing.sourceType !== SOURCE_TYPE || existing.sourceId !== version.id) {
          throw new ConflictException("CUSTOM_QUOTATION_VERSION_SALES_ORDER_CONFLICT");
        }
        await this.operationsIntakeOutboxProducer.persistMaterializedVersion(tx as unknown as Prisma.TransactionClient, tenantId, version.id);
        return salesOrderResponse(existing, true);
      }

      const lines = materializedLines(version);
      const totals = sumMaterializedAmounts(lines);
      if (!totals.total.equals(asAmount(version.finalSellingPrice, "CUSTOM_QUOTATION_VERSION_PRICE_INVALID"))) {
        throw new ConflictException("CUSTOM_QUOTATION_VERSION_SOLD_AMOUNT_MISMATCH");
      }
      const result = await this.salesOrders.materializeInTransaction(tx, { tenantId }, {
        source: { tenantId, sourceType: SOURCE_TYPE, sourceId: version.id },
        customerId: version.customQuotation.customerId,
        customerName: version.customQuotation.customer.fullName,
        customerEmail: version.customQuotation.customer.email,
        currency: version.currency,
        commercialSubtotal: totals.subtotal,
        totalVat: totals.vatAmount,
        total: totals.total,
        paymentConditionType: version.paymentConditionType,
        paymentTermValue: version.paymentTermValue,
        paymentTermUnit: version.paymentTermUnit,
        commercialObservations: version.commercialObservations,
        actor,
        lines,
      });

      const linked = await tx.customQuotationVersion.updateMany({
        where: { id: version.id, tenantId, customQuotationId: quotationId, salesOrderId: null },
        data: { salesOrderId: result.salesOrderId },
      });
      if (linked.count !== 1) throw new ConflictException("CUSTOM_QUOTATION_VERSION_SALES_ORDER_LINK_CONFLICT");
      await this.operationsIntakeOutboxProducer.persistMaterializedVersion(tx as unknown as Prisma.TransactionClient, tenantId, version.id);
      return salesOrderResponse(result, result.reusedExisting);
    });
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: CustomQuotationSalesOrderTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

async function lockQuotation(tx: CustomQuotationSalesOrderTransaction, tenantId: string, quotationId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "custom_quotations"
    WHERE "id" = ${quotationId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");
}

async function lockVersion(tx: CustomQuotationSalesOrderTransaction, tenantId: string, quotationId: string, versionId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "custom_quotation_versions"
    WHERE "id" = ${versionId} AND "tenantId" = ${tenantId} AND "customQuotationId" = ${quotationId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new NotFoundException("CUSTOM_QUOTATION_VERSION_NOT_FOUND");
}

function validateVersionSnapshot(version: any) {
  const requiredText = [
    version.customQuotation.customerId,
    version.customQuotation.customer?.fullName,
    version.fiscalDescription,
    version.cabysCode,
    version.unitOfMeasureCode,
    version.taxCode,
    version.taxRateCode,
  ];
  if (requiredText.some((value) => typeof value !== "string" || !value.trim()) ||
    (version.fiscalItemCategory !== "SERVICE" && version.fiscalItemCategory !== "MERCHANDISE")) {
    throw new ConflictException("CUSTOM_QUOTATION_VERSION_SNAPSHOT_INVALID");
  }
  asAmount(version.finalSellingPrice, "CUSTOM_QUOTATION_VERSION_PRICE_INVALID");
  asPercentage(version.fiscalTaxPercentage, "CUSTOM_QUOTATION_VERSION_FISCAL_TAX_INVALID");
  const condition = version.paymentConditionType;
  const validTerms = (condition === null && version.paymentTermValue === null && version.paymentTermUnit === null)
    || (condition === "CASH" && version.paymentTermValue === null && version.paymentTermUnit === null)
    || (condition === "CREDIT" && Number.isInteger(version.paymentTermValue) && version.paymentTermValue > 0 && (version.paymentTermUnit === "DAYS" || version.paymentTermUnit === "MONTHS"));
  if (!validTerms) throw new ConflictException("CUSTOM_QUOTATION_VERSION_PAYMENT_TERMS_INVALID");
}

function materializedLines(version: any) {
  if (!Array.isArray(version.lines) || version.lines.length === 0) {
    throw new ConflictException("CUSTOM_QUOTATION_VERSION_LINES_EMPTY");
  }
  if (version.lines.length > MAX_SALES_ORDER_LINES) {
    throw new ConflictException("CUSTOM_QUOTATION_VERSION_LINES_LIMIT_EXCEEDED");
  }
  return version.lines.map((versionLine: any) => {
    if (versionLine.soldAmount === null || versionLine.soldAmount === undefined) {
      throw new ConflictException("CUSTOM_QUOTATION_VERSION_LINE_SOLD_AMOUNT_MISSING");
    }
    const fiscal = lineFiscalSnapshot(version, versionLine);
    const amounts = inclusiveAmounts(versionLine.soldAmount, fiscal.fiscalTaxPercentage);
    return {
      customQuotationVersionLineId: requiredIdentifier(versionLine.id, "CUSTOM_QUOTATION_VERSION_LINE_INVALID"),
      serviceCode: SERVICE_CODE,
      description: requiredDescription(versionLine.description),
      fiscalItemCategory: fiscal.fiscalItemCategory,
      fiscalDescription: requiredDescription(fiscal.fiscalDescription),
      cabysCode: fiscal.cabysCode,
      unitOfMeasureCode: fiscal.unitOfMeasureCode,
      taxCode: fiscal.taxCode,
      taxRateCode: fiscal.taxRateCode,
      fiscalTaxPercentage: fiscal.fiscalTaxPercentage,
      fiscalClassificationId: fiscal.fiscalClassificationId,
      commercialNotes: optionalCommercialNote(versionLine.commercialNote),
      subtotal: amounts.subtotal,
      vatPercentage: fiscal.fiscalTaxPercentage,
      vatAmount: amounts.vatAmount,
      total: amounts.total,
      participants: [],
    };
  });
}

function lineFiscalSnapshot(version: any, line: any) {
  const hasLineSnapshot = [
    line.fiscalClassificationId,
    line.fiscalDescription,
    line.fiscalItemCategory,
    line.cabysCode,
    line.unitOfMeasureCode,
    line.taxCode,
    line.taxRateCode,
    line.fiscalTaxPercentage,
  ].some((value) => value !== null && value !== undefined);
  const source = hasLineSnapshot ? line : version;
  if (!source.fiscalDescription || !source.cabysCode || !source.unitOfMeasureCode || !source.taxCode || !source.taxRateCode ||
    (source.fiscalItemCategory !== "SERVICE" && source.fiscalItemCategory !== "MERCHANDISE")) {
    throw new ConflictException("CUSTOM_QUOTATION_VERSION_LINE_FISCAL_SNAPSHOT_INVALID");
  }
  return {
    fiscalClassificationId: source.fiscalClassificationId ?? null,
    fiscalDescription: hasLineSnapshot ? source.fiscalDescription : line.description,
    fiscalItemCategory: source.fiscalItemCategory,
    cabysCode: source.cabysCode,
    unitOfMeasureCode: source.unitOfMeasureCode,
    taxCode: source.taxCode,
    taxRateCode: source.taxRateCode,
    fiscalTaxPercentage: asPercentage(source.fiscalTaxPercentage, "CUSTOM_QUOTATION_VERSION_LINE_FISCAL_TAX_INVALID"),
  };
}

function sumMaterializedAmounts(lines: ReadonlyArray<{ subtotal: Prisma.Decimal; vatAmount: Prisma.Decimal; total: Prisma.Decimal }>) {
  return lines.reduce((sums, line) => ({
    subtotal: sums.subtotal.plus(line.subtotal),
    vatAmount: sums.vatAmount.plus(line.vatAmount),
    total: sums.total.plus(line.total),
  }), { subtotal: new Prisma.Decimal(0), vatAmount: new Prisma.Decimal(0), total: new Prisma.Decimal(0) });
}

function inclusiveAmounts(soldAmount: unknown, fiscalTaxPercentage: unknown) {
  const total = asAmount(soldAmount, "CUSTOM_QUOTATION_VERSION_LINE_SOLD_AMOUNT_INVALID");
  const taxPercent = asPercentage(fiscalTaxPercentage, "CUSTOM_QUOTATION_VERSION_FISCAL_TAX_INVALID");
  const subtotal = total.dividedBy(HUNDRED.plus(taxPercent)).times(HUNDRED)
    .toDecimalPlaces(5, Prisma.Decimal.ROUND_HALF_UP);
  return { subtotal, vatAmount: total.minus(subtotal), total };
}

function requiredIdentifier(value: unknown, code: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 191) {
    throw new ConflictException(code);
  }
  return value.trim();
}

function requiredDescription(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 500) {
    throw new ConflictException("CUSTOM_QUOTATION_VERSION_LINE_INVALID");
  }
  return value.trim();
}

function optionalCommercialNote(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 2000) {
    throw new ConflictException("CUSTOM_QUOTATION_VERSION_LINE_INVALID");
  }
  return value.trim();
}

function asAmount(value: unknown, code: string) {
  const decimal = decimalValue(value, code);
  if (decimal.isNegative() || decimal.decimalPlaces() > 5 || decimal.greaterThan("99999999999999.99999")) {
    throw new ConflictException(code);
  }
  return decimal;
}

function asPercentage(value: unknown, code: string) {
  const decimal = decimalValue(value, code);
  if (decimal.isNegative() || decimal.decimalPlaces() > 4 || decimal.greaterThan(100)) {
    throw new ConflictException(code);
  }
  return decimal;
}

function decimalValue(value: unknown, code: string) {
  try {
    const decimal = new Prisma.Decimal(String(value));
    if (!decimal.isFinite()) throw new Error(code);
    return decimal;
  } catch {
    throw new ConflictException(code);
  }
}

function salesOrderResponse(order: { salesOrderId?: string; id?: string; orderNumber: string }, reusedExisting: boolean) {
  return {
    salesOrderId: order.salesOrderId ?? order.id,
    orderNumber: order.orderNumber,
    reusedExisting,
  };
}
