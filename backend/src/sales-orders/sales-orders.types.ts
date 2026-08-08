export type SalesOrderCurrency = "USD" | "CRC";
export type SalesOrderPaymentConditionType = "CASH" | "CREDIT";
export type SalesOrderPaymentTermUnit = "DAYS" | "MONTHS";

export interface SalesOrderListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  currency?: SalesOrderCurrency;
  paymentConditionType?: SalesOrderPaymentConditionType;
}

export interface SalesOrderListItemRecord {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  customerEmail: string | null;
  currency: SalesOrderCurrency;
  commercialSubtotal: string;
  totalVat: string;
  total: string;
  paymentConditionType: SalesOrderPaymentConditionType | null;
  paymentTermValue: number | null;
  paymentTermUnit: SalesOrderPaymentTermUnit | null;
  sourceType: string;
  createdByName: string;
  createdAt: Date;
}

export interface SalesOrderListPageRecord {
  salesOrders: SalesOrderListItemRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SalesOrderLineRecord {
  id: string;
  serviceCode: string;
  serviceName: string;
  serviceDetailsVersion: number | null;
  serviceDetails: unknown;
  commercialNotes: string | null;
  subtotal: string;
  vatPercentage: string;
  vatAmount: string;
  total: string;
  participants: unknown;
}

export interface SalesOrderDetailRecord {
  id: string;
  orderNumber: string;
  status: string;
  sourceType: string;
  sourceId: string;
  customerId: string | null;
  customerName: string;
  customerEmail: string | null;
  currency: SalesOrderCurrency;
  commercialSubtotal: string;
  totalVat: string;
  total: string;
  paymentConditionType: SalesOrderPaymentConditionType | null;
  paymentTermValue: number | null;
  paymentTermUnit: SalesOrderPaymentTermUnit | null;
  commercialObservations: string | null;
  createdByUserId: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  lines: SalesOrderLineRecord[];
}
