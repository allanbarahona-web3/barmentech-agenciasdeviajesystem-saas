import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  Prisma,
  type FiscalItemCategory,
  type PrismaClient,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const SOURCE_TYPE = "ADDITIONAL_SERVICE_ORDER";

export interface SalesOrderSummary {
  id: string;
  orderNumber: string;
  status: "CREATED";
  currency: string;
  commercialSubtotal: string;
  totalVat: string;
  total: string;
  paymentConditionType: string | null;
  paymentTermValue: number | null;
  paymentTermUnit: string | null;
  commercialObservations: string | null;
  customer: { name: string; email: string | null };
  lines: Array<{
    serviceCode: string;
    serviceName: string;
    fiscalItemCategory: FiscalItemCategory | null;
    serviceDetailsVersion: number | null;
    serviceDetails: unknown;
    commercialNotes: string | null;
    subtotal: string;
    vatPercentage: string;
    vatAmount: string;
    total: string;
    participants: unknown;
  }>;
  createdAt: Date;
}

export interface SalesOrderMaterializationResult {
  salesOrder: SalesOrderSummary;
  reusedExisting: boolean;
}

@Injectable()
export class SalesOrderConversionService {
  constructor(private readonly prisma: PrismaService) {}

  convertAdditionalServiceOrder(
    tenantId: string,
    sourceId: string,
    actor: { id: string; fullName: string },
  ): Promise<SalesOrderSummary> {
    return this.prisma.$transaction(async (tx) => {
      const result = await this.materializeAdditionalServiceOrder(
        tx,
        tenantId,
        sourceId,
        actor,
      );
      return result.salesOrder;
    });
  }

  async materializeAdditionalServiceOrder(
    tx: Prisma.TransactionClient,
    tenantId: string,
    sourceId: string,
    actor: { id: string; fullName: string },
  ): Promise<SalesOrderMaterializationResult> {
    await this.lockAdditionalServiceOrder(tx, tenantId, sourceId);
    const proposals = await tx.$queryRaw<Array<{
        id: string;
        commercialStatus: string | null;
        quoteCustomerId: string | null;
        customerName: string | null;
        customerEmail: string | null;
        quotationCurrency: string;
        commercialSubtotal: Prisma.Decimal;
        totalVat: Prisma.Decimal;
        totalSellingPrice: Prisma.Decimal;
        paymentConditionType: string | null;
        paymentTermValue: number | null;
        paymentTermUnit: string | null;
        commercialObservations: string | null;
    }>>`SELECT o."id", o."commercialStatus", o."quoteCustomerId",
                 c."fullName" AS "customerName", c."email" AS "customerEmail",
                 o."quotationCurrency", o."commercialSubtotal", o."totalVat",
                 o."totalSellingPrice", o."paymentConditionType", o."paymentTermValue",
                 o."paymentTermUnit", o."commercialObservations"
          FROM "additional_service_orders" o
          LEFT JOIN "Client" c ON c."id" = o."quoteCustomerId" AND c."tenantId" = o."tenantId"
          WHERE o."id" = ${sourceId} AND o."tenantId" = ${tenantId}
          FOR UPDATE OF o`;
    const proposal = proposals[0];
    if (!proposal) throw new NotFoundException("Propuesta comercial no encontrada.");
    if (proposal.commercialStatus !== "APPROVED") {
      throw new ConflictException(
        "Solo una propuesta comercial aprobada puede convertirse en orden de venta.",
      );
    }

    const existing = await this.findBySourceWithClient(tx, tenantId, sourceId);
    if (existing) {
      return { salesOrder: existing, reusedExisting: true };
    }

    const lines = await tx.$queryRaw<Array<{
        additionalServiceCatalogId: string | null;
        fiscalItemCategory: unknown;
        serviceCode: string;
        serviceName: string;
        serviceDetailsVersion: number | null;
        serviceDetails: unknown;
        commercialNotes: string | null;
        subtotal: Prisma.Decimal;
        vatPercentage: Prisma.Decimal;
        vatAmount: Prisma.Decimal;
        total: Prisma.Decimal;
        participants: unknown;
    }>>`SELECT l."additionalServiceCatalogId", catalog."fiscalItemCategory", l."serviceCode", l."serviceName", l."serviceDetailsVersion",
                 l."serviceDetails", l."commercialNotes", l."subtotal",
                 l."vatPercentage", l."vatAmount", l."finalSellingPrice" AS "total",
                 COALESCE(jsonb_agg(jsonb_build_object(
                   'role', p."role", 'fullName', p."fullName",
                   'identification', p."identification", 'email', p."email", 'phone', p."phone"
                 ) ORDER BY p."createdAt") FILTER (WHERE p."id" IS NOT NULL), '[]'::jsonb) AS "participants"
          FROM "additional_service_order_lines" l
          LEFT JOIN "additional_service_catalogs" catalog
            ON catalog."id" = l."additionalServiceCatalogId" AND catalog."tenantId" = l."tenantId"
          LEFT JOIN "additional_service_order_participants" p
            ON p."lineId" = l."id" AND p."tenantId" = l."tenantId"
          WHERE l."orderId" = ${sourceId} AND l."tenantId" = ${tenantId}
          GROUP BY l."id", catalog."fiscalItemCategory"
          ORDER BY l."createdAt", l."id"`;

    const snapshotLines = lines.map((line) => {
        if (!line.additionalServiceCatalogId) {
          throw new BadRequestException({
            code: "SALES_ORDER_LINE_CATALOG_IDENTITY_MISSING",
            message:
              "Una línea del servicio adicional no tiene una identidad de catálogo válida.",
          });
        }
        const fiscalItemCategory = toFiscalItemCategory(line.fiscalItemCategory);
        if (!fiscalItemCategory) {
          throw new BadRequestException({
            code: "SALES_ORDER_LINE_FISCAL_ITEM_CATEGORY_INVALID",
            message:
              "Una línea del servicio adicional no tiene una clasificación fiscal válida.",
          });
        }
        return {
          ...line,
          additionalServiceCatalogId: line.additionalServiceCatalogId,
          fiscalItemCategory,
        };
    });

    const year = new Date().getUTCFullYear();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:SALES_ORDER_NUMBER:${year}`}, 0))`;
    const numberRows = await tx.$queryRaw<Array<{ next: bigint }>>`
        SELECT COALESCE(MAX(RIGHT("orderNumber", 6)::bigint), 0) + 1 AS "next" FROM "sales_orders"
        WHERE "tenantId" = ${tenantId} AND "orderNumber" LIKE ${`SO-${year}-%`}`;
    const orderNumber = `SO-${year}-${String(numberRows[0]?.next ?? 1).padStart(6, "0")}`;
    const salesOrderId = randomUUID();
    await tx.$executeRaw`INSERT INTO "sales_orders" (
          "id", "tenantId", "orderNumber", "sourceType", "sourceId", "customerId",
          "customerName", "customerEmail", "currency", "commercialSubtotal", "totalVat", "total",
          "paymentConditionType", "paymentTermValue", "paymentTermUnit", "commercialObservations",
          "createdByUserId", "createdByName", "updatedAt"
        ) VALUES (
          ${salesOrderId}, ${tenantId}, ${orderNumber}, ${SOURCE_TYPE}, ${sourceId}, ${proposal.quoteCustomerId},
          ${proposal.customerName ?? "Cliente"}, ${proposal.customerEmail}, ${proposal.quotationCurrency}::"Currency",
          ${proposal.commercialSubtotal}, ${proposal.totalVat}, ${proposal.totalSellingPrice},
          ${proposal.paymentConditionType}::"PaymentConditionType", ${proposal.paymentTermValue}, ${proposal.paymentTermUnit}::"PaymentTermUnit",
          ${proposal.commercialObservations}, ${actor.id}, ${actor.fullName}, CURRENT_TIMESTAMP
        )`;

    for (const line of snapshotLines) {
      await tx.$executeRaw`INSERT INTO "sales_order_lines" (
            "id", "tenantId", "salesOrderId", "additionalServiceCatalogId", "fiscalItemCategory", "serviceCode", "serviceName", "serviceDetailsVersion",
            "serviceDetails", "commercialNotes", "subtotal", "vatPercentage", "vatAmount", "total",
            "participants", "updatedAt"
          ) VALUES (
            ${randomUUID()}, ${tenantId}, ${salesOrderId}, ${line.additionalServiceCatalogId}, ${line.fiscalItemCategory}::"FiscalItemCategory", ${line.serviceCode}, ${line.serviceName},
            ${line.serviceDetailsVersion}, ${JSON.stringify(line.serviceDetails)}::jsonb, ${line.commercialNotes},
            ${line.subtotal}, ${line.vatPercentage}, ${line.vatAmount}, ${line.total},
            ${JSON.stringify(line.participants)}::jsonb, CURRENT_TIMESTAMP
          )`;
    }
    const created = await this.findBySourceWithClient(tx, tenantId, sourceId);
    if (!created) {
      throw new InternalServerErrorException({
        code: "SALES_ORDER_MATERIALIZATION_NOT_FOUND",
        message: "No se pudo confirmar la orden de venta materializada.",
      });
    }
    return { salesOrder: created, reusedExisting: false };
  }

  lockAdditionalServiceOrder(
    tx: Prisma.TransactionClient,
    tenantId: string,
    sourceId: string,
  ): Promise<unknown> {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${SOURCE_TYPE}:${sourceId}`}, 0))`;
  }

  findByAdditionalServiceOrder(
    tenantId: string,
    sourceId: string,
  ): Promise<SalesOrderSummary | null> {
    return this.findBySourceWithClient(this.prisma, tenantId, sourceId);
  }

  private async findBySourceWithClient(
    client: Pick<PrismaClient, "$queryRaw">,
    tenantId: string,
    sourceId: string,
  ): Promise<SalesOrderSummary | null> {
    const rows = await client.$queryRaw<Array<Record<string, unknown>>>`
      SELECT so."id", so."orderNumber", so."status", so."currency",
             so."commercialSubtotal"::text, so."totalVat"::text, so."total"::text,
             so."paymentConditionType", so."paymentTermValue", so."paymentTermUnit",
             so."commercialObservations", so."customerName", so."customerEmail", so."createdAt",
             COALESCE(jsonb_agg(jsonb_build_object(
               'serviceCode', l."serviceCode", 'serviceName', l."serviceName",
               'fiscalItemCategory', l."fiscalItemCategory",
               'serviceDetailsVersion', l."serviceDetailsVersion", 'serviceDetails', l."serviceDetails",
               'commercialNotes', l."commercialNotes", 'subtotal', l."subtotal"::text,
               'vatPercentage', l."vatPercentage"::text, 'vatAmount', l."vatAmount"::text,
               'total', l."total"::text, 'participants', l."participants"
             ) ORDER BY l."createdAt") FILTER (WHERE l."id" IS NOT NULL), '[]'::jsonb) AS "lines"
      FROM "sales_orders" so LEFT JOIN "sales_order_lines" l
        ON l."salesOrderId" = so."id" AND l."tenantId" = so."tenantId"
      WHERE so."tenantId" = ${tenantId} AND so."sourceType" = ${SOURCE_TYPE} AND so."sourceId" = ${sourceId}
      GROUP BY so."id"`;
    const row = rows[0];
    if (!row) return null;
    return {
      id: String(row.id), orderNumber: String(row.orderNumber), status: "CREATED",
      currency: String(row.currency), commercialSubtotal: String(row.commercialSubtotal),
      totalVat: String(row.totalVat), total: String(row.total),
      paymentConditionType: row.paymentConditionType ? String(row.paymentConditionType) : null,
      paymentTermValue: row.paymentTermValue as number | null,
      paymentTermUnit: row.paymentTermUnit ? String(row.paymentTermUnit) : null,
      commercialObservations: row.commercialObservations as string | null,
      customer: { name: String(row.customerName), email: row.customerEmail as string | null },
      lines: row.lines as SalesOrderSummary["lines"], createdAt: row.createdAt as Date,
    };
  }
}

function toFiscalItemCategory(value: unknown): FiscalItemCategory | null {
  return value === "SERVICE" || value === "MERCHANDISE" ? value : null;
}
