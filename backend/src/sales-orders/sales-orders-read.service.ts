import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ListSalesOrdersDto } from "./dto";
import {
  SALES_ORDERS_REPOSITORY,
  type SalesOrdersRepository,
} from "./sales-orders.repository.interface";
import type {
  SalesOrderDetailRecord,
  SalesOrderListPageRecord,
} from "./sales-orders.types";

@Injectable()
export class SalesOrdersReadService {
  constructor(
    @Inject(SALES_ORDERS_REPOSITORY)
    private readonly repository: SalesOrdersRepository,
  ) {}

  list(
    tenantId: string,
    dto: ListSalesOrdersDto,
  ): Promise<SalesOrderListPageRecord> {
    const search = String(dto.search || "").trim();
    return this.repository.findPage(tenantId, {
      page: dto.page ?? 1,
      pageSize: dto.pageSize ?? 20,
      ...(search ? { search } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.currency ? { currency: dto.currency } : {}),
      ...(dto.paymentConditionType
        ? { paymentConditionType: dto.paymentConditionType }
        : {}),
    });
  }

  async getById(
    tenantId: string,
    salesOrderId: string,
  ): Promise<SalesOrderDetailRecord> {
    const order = await this.repository.findById(tenantId, salesOrderId);
    if (!order) {
      throw new NotFoundException("Orden de venta no encontrada.");
    }
    return order;
  }
}
