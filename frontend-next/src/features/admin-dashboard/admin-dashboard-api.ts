import { fetchApi } from "@/lib/api-client";

export type AdminDashboardPeriod = "TODAY" | "LAST_7_DAYS" | "LAST_30_DAYS" | "THIS_MONTH" | "CUSTOM";

export type AdminDashboardQuery = {
  period: AdminDashboardPeriod;
  dateFrom?: string;
  dateTo?: string;
};

export type DashboardCurrencyAmount = {
  currencyCode: string;
  amount: string;
  count: number;
};

export type AdminDashboardResponse = {
  period: { kind: AdminDashboardPeriod; startOn: string; endOn: string; timezone: string };
  receivables: {
    outstandingByCurrency: DashboardCurrencyAmount[];
    overdueByCurrency: DashboardCurrencyAmount[];
    openCount: number;
    overdueCount: number;
  };
  payments: {
    receivedByCurrency: DashboardCurrencyAmount[];
    receivedCount: number;
    pendingVerificationCount: number;
  };
  fiscal: {
    submittedDocumentCount: number;
    acceptedDocumentCount: number;
    netSalesByCurrency: Array<{ currencyCode: string; amount: string }>;
  };
  sales: { orderCount: number; totalByCurrency: DashboardCurrencyAmount[] };
  commercial: {
    contractedSales: { obligationCount: number; totalByCurrency: DashboardCurrencyAmount[] };
    averageContractTicketByCurrency: Array<{ currencyCode: string; amount: string; obligationCount: number }>;
    passengerTrend: Array<{ month: string; passengerCount: number }>;
  };
  operations: { activeTripsCount: number; activePassengersCount: number };
  operationalCosts: {
    actualByCurrency: Array<{ currencyCode: string; purchaseCount: number; subtotal: string; tax: string; total: string }>;
  };
  dailyPayments: Array<{ date: string; currencyCode: string; amount: string; paymentCount: number }>;
  topOverdueCustomers: Array<{
    customerId: string;
    customerName: string;
    currencyCode: string;
    outstandingAmount: string;
    receivableCount: number;
    rank: number;
  }>;
};

export class AdminDashboardApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AdminDashboardApiError";
  }
}

export async function getAdminDashboard(query: AdminDashboardQuery, signal?: AbortSignal): Promise<AdminDashboardResponse> {
  const params: Record<string, string> = { period: query.period };
  if (query.period === "CUSTOM" && query.dateFrom && query.dateTo) {
    params.dateFrom = query.dateFrom;
    params.dateTo = query.dateTo;
  }
  const response = await fetchApi("/reporting/admin-dashboard", { params, signal });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new AdminDashboardApiError(payload.message || "No se pudo cargar el dashboard administrativo.", response.status);
  }
  return response.json() as Promise<AdminDashboardResponse>;
}
