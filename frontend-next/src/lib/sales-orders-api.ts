import { apiGet, fetchApi } from '@/lib/api-client';

export type SalesOrderStatus = 'CREATED';
export type SalesOrderCurrency = 'USD' | 'CRC';
export type SalesOrderPaymentCondition = 'CASH' | 'CREDIT';
export type SalesOrderPaymentTermUnit = 'DAYS' | 'MONTHS';

export interface SalesOrderListItem {
  id: string;
  orderNumber: string;
  status: SalesOrderStatus;
  customerName: string;
  customerEmail: string | null;
  currency: SalesOrderCurrency;
  commercialSubtotal: string;
  totalVat: string;
  total: string;
  paymentConditionType: SalesOrderPaymentCondition | null;
  paymentTermValue: number | null;
  paymentTermUnit: SalesOrderPaymentTermUnit | null;
  sourceType: string;
  createdByName: string;
  createdAt: string;
}

export interface SalesOrdersPage {
  salesOrders: SalesOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListSalesOrdersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: SalesOrderStatus;
  currency?: SalesOrderCurrency;
  paymentConditionType?: SalesOrderPaymentCondition;
}

export interface SalesOrderLine {
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

export interface SalesOrderDetail extends SalesOrderListItem {
  sourceId: string;
  customerId: string | null;
  commercialObservations: string | null;
  createdByUserId: string;
  updatedAt: string;
  lines: SalesOrderLine[];
}

export class SalesOrderNotFoundError extends Error {
  constructor() {
    super('Sales order not found');
    this.name = 'SalesOrderNotFoundError';
  }
}

export function getSalesOrders(
  params: ListSalesOrdersParams,
  signal?: AbortSignal,
): Promise<SalesOrdersPage> {
  const query: Record<string, string | number | boolean> = {};
  if (params.page !== undefined) query.page = params.page;
  if (params.pageSize !== undefined) query.pageSize = params.pageSize;
  if (params.search) query.search = params.search;
  if (params.status) query.status = params.status;
  if (params.currency) query.currency = params.currency;
  if (params.paymentConditionType) {
    query.paymentConditionType = params.paymentConditionType;
  }
  return apiGet<SalesOrdersPage>('/sales-orders', { params: query, signal });
}

export async function getSalesOrder(
  id: string,
  signal?: AbortSignal,
): Promise<SalesOrderDetail> {
  const response = await fetchApi(`/sales-orders/${encodeURIComponent(id)}`, {
    method: 'GET',
    signal,
  });
  if (response.status === 404) throw new SalesOrderNotFoundError();
  if (!response.ok) throw new Error('Unable to load sales order');
  return response.json() as Promise<SalesOrderDetail>;
}
