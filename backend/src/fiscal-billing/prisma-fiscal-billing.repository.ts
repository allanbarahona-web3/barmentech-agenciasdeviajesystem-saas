import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  ADDITIONAL_SERVICE_SALES_ORDER_SOURCE_TYPE,
  ELIGIBLE_SALES_ORDER_STATUS,
  FISCAL_BILLING_SOURCE_TYPE,
} from "./fiscal-billing.constants";
import type { SalesOrderFiscalBillingRepository } from "./fiscal-billing.repository";
import type {
  FiscalIssuerSnapshot,
  SalesOrderSource,
} from "./fiscal-billing.types";

@Injectable()
export class PrismaSalesOrderFiscalBillingRepository
  implements SalesOrderFiscalBillingRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async listEligibleSalesOrders(
    tenantId: string,
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.SalesOrderWhereInput = {
      tenantId,
      sourceType: ADDITIONAL_SERVICE_SALES_ORDER_SOURCE_TYPE,
      status: ELIGIBLE_SALES_ORDER_STATUS,
      lines: {
        some: {},
        none: {
          OR: [
            { additionalServiceCatalogId: null },
            { fiscalItemCategory: null },
          ],
        },
      },
    };
    const [orders, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          sourceType: true,
          customerName: true,
          customerEmail: true,
          currency: true,
          commercialSubtotal: true,
          totalVat: true,
          total: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.salesOrder.count({ where }),
    ]);
    const existing = orders.length
      ? await this.prisma.billingDocument.findMany({
          where: {
            tenantId,
            sourceType: FISCAL_BILLING_SOURCE_TYPE,
            sourceId: { in: orders.map((order) => order.id) },
            sourceRole: "PRIMARY",
          },
          select: {
            id: true,
            sourceId: true,
            internalNumber: true,
            lifecycleStatus: true,
            documentTypeCode: true,
          },
        })
      : [];
    const documentBySource = new Map(
      existing.map((document) => [document.sourceId, document]),
    );
    return {
      salesOrders: orders.map((order) => {
        const document = documentBySource.get(order.id) ?? null;
        return {
          ...order,
          commercialSubtotal: order.commercialSubtotal.toFixed(4),
          totalVat: order.totalVat.toFixed(4),
          total: order.total.toFixed(4),
          existingPrimaryDocument: document,
          action: !document
            ? "START"
            : document.lifecycleStatus === "DRAFT"
              ? "RESUME"
              : "VIEW",
        };
      }),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findSalesOrder(
    tenantId: string,
    salesOrderId: string,
  ): Promise<SalesOrderSource | null> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { tenantId, id: salesOrderId },
      include: {
        lines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    });
    if (!order) return null;
    const customerFiscalIdentity = order.customerId
      ? await this.prisma.client.findFirst({
          where: { id: order.customerId, tenantId },
          select: { id: true, idType: true, idNumber: true },
        })
      : null;
    return {
      ...order,
      customerFiscalIdentity,
      currency: order.currency,
      commercialSubtotal: order.commercialSubtotal.toFixed(4),
      totalVat: order.totalVat.toFixed(4),
      total: order.total.toFixed(4),
      lines: order.lines.map((line) => ({
        ...line,
        subtotal: line.subtotal.toFixed(4),
        vatPercentage: line.vatPercentage.toFixed(4),
        vatAmount: line.vatAmount.toFixed(4),
        total: line.total.toFixed(4),
      })),
    };
  }

  findBillingConfiguration(tenantId: string) {
    return this.prisma.tenantBillingConfiguration.findUnique({
      where: { tenantId },
      select: {
        billingEnabled: true,
        electronicIssuanceEnabled: true,
        countryCode: true,
        fiscalSchemaVersion: true,
      },
    });
  }

  async findFiscalProfiles(tenantId: string, catalogIds: string[]) {
    if (!catalogIds.length) return [];
    const profiles = await this.prisma.additionalServiceFiscalProfile.findMany({
      where: { tenantId, additionalServiceCatalogId: { in: catalogIds } },
      select: {
        additionalServiceCatalogId: true,
        cabysCode: true,
        unitOfMeasureCode: true,
        taxCode: true,
        taxRateCode: true,
        taxPercentage: true,
        isActive: true,
      },
    });
    return profiles.map((profile) => ({
      ...profile,
      taxPercentage: profile.taxPercentage?.toFixed(4) ?? null,
    }));
  }

  async findActiveIssuers(tenantId: string): Promise<FiscalIssuerSnapshot[]> {
    const issuers = await this.prisma.fiscalIssuer.findMany({
      where: { tenantId, isActive: true },
      include: {
        economicActivities: {
          orderBy: [{ displayOrder: "asc" }, { economicActivityCode: "asc" }],
        },
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
    });
    return issuers;
  }

  findIssuer(
    tenantId: string,
    issuerId: string,
  ): Promise<FiscalIssuerSnapshot | null> {
    return this.prisma.fiscalIssuer.findFirst({
      where: { tenantId, id: issuerId },
      include: {
        economicActivities: {
          orderBy: [{ displayOrder: "asc" }, { economicActivityCode: "asc" }],
        },
      },
    });
  }

}
