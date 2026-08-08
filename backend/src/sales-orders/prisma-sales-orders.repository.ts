import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { SalesOrdersRepository } from "./sales-orders.repository.interface";
import type {
  SalesOrderDetailRecord,
  SalesOrderListPageRecord,
  SalesOrderListQuery,
} from "./sales-orders.types";

@Injectable()
export class PrismaSalesOrdersRepository implements SalesOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(
    tenantId: string,
    query: SalesOrderListQuery,
  ): Promise<SalesOrderListPageRecord> {
    const where: Prisma.SalesOrderWhereInput = {
      tenantId,
      ...(query.search
        ? {
            OR: [
              {
                orderNumber: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                customerName: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                customerEmail: {
                  contains: query.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.paymentConditionType
        ? { paymentConditionType: query.paymentConditionType }
        : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [orders, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          customerName: true,
          customerEmail: true,
          currency: true,
          commercialSubtotal: true,
          totalVat: true,
          total: true,
          paymentConditionType: true,
          paymentTermValue: true,
          paymentTermUnit: true,
          sourceType: true,
          createdByName: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    return {
      salesOrders: orders.map((order) => ({
        ...order,
        commercialSubtotal: String(order.commercialSubtotal),
        totalVat: String(order.totalVat),
        total: String(order.total),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async findById(
    tenantId: string,
    salesOrderId: string,
  ): Promise<SalesOrderDetailRecord | null> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: salesOrderId, tenantId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        sourceType: true,
        sourceId: true,
        customerId: true,
        customerName: true,
        customerEmail: true,
        currency: true,
        commercialSubtotal: true,
        totalVat: true,
        total: true,
        paymentConditionType: true,
        paymentTermValue: true,
        paymentTermUnit: true,
        commercialObservations: true,
        createdByUserId: true,
        createdByName: true,
        createdAt: true,
        updatedAt: true,
        lines: {
          select: {
            id: true,
            serviceCode: true,
            serviceName: true,
            serviceDetailsVersion: true,
            serviceDetails: true,
            commercialNotes: true,
            subtotal: true,
            vatPercentage: true,
            vatAmount: true,
            total: true,
            participants: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!order) return null;

    return {
      ...order,
      commercialSubtotal: String(order.commercialSubtotal),
      totalVat: String(order.totalVat),
      total: String(order.total),
      lines: order.lines.map((line) => ({
        ...line,
        subtotal: String(line.subtotal),
        vatPercentage: String(line.vatPercentage),
        vatAmount: String(line.vatAmount),
        total: String(line.total),
      })),
    };
  }
}
