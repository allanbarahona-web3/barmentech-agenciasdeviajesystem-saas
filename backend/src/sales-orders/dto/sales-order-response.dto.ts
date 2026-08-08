import type {
  SalesOrderCurrency,
  SalesOrderPaymentConditionType,
  SalesOrderPaymentTermUnit,
} from "../sales-orders.types";

export class SalesOrderListItemDto {
  id!: string;
  orderNumber!: string;
  status!: string;
  customerName!: string;
  customerEmail!: string | null;
  currency!: SalesOrderCurrency;
  commercialSubtotal!: string;
  totalVat!: string;
  total!: string;
  paymentConditionType!: SalesOrderPaymentConditionType | null;
  paymentTermValue!: number | null;
  paymentTermUnit!: SalesOrderPaymentTermUnit | null;
  sourceType!: string;
  createdByName!: string;
  createdAt!: Date;
}

export class SalesOrderListResponseDto {
  salesOrders!: SalesOrderListItemDto[];
  total!: number;
  page!: number;
  pageSize!: number;
  totalPages!: number;
}

export class SalesOrderLineDto {
  id!: string;
  serviceCode!: string;
  serviceName!: string;
  serviceDetailsVersion!: number | null;
  serviceDetails!: unknown;
  commercialNotes!: string | null;
  subtotal!: string;
  vatPercentage!: string;
  vatAmount!: string;
  total!: string;
  participants!: unknown;
}

export class SalesOrderDetailDto extends SalesOrderListItemDto {
  sourceId!: string;
  customerId!: string | null;
  commercialObservations!: string | null;
  createdByUserId!: string;
  updatedAt!: Date;
  lines!: SalesOrderLineDto[];
}
