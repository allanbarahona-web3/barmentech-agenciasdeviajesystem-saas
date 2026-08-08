import type {
  SalesOrderDetailRecord,
  SalesOrderListPageRecord,
  SalesOrderListQuery,
} from "./sales-orders.types";

export const SALES_ORDERS_REPOSITORY = Symbol("SALES_ORDERS_REPOSITORY");

export interface SalesOrdersRepository {
  findPage(
    tenantId: string,
    query: SalesOrderListQuery,
  ): Promise<SalesOrderListPageRecord>;
  findById(
    tenantId: string,
    salesOrderId: string,
  ): Promise<SalesOrderDetailRecord | null>;
}
