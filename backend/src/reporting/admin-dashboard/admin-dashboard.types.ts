import type { AdminDashboardPeriodKind } from "./admin-dashboard-query.dto";

export type DashboardCurrencyAmount = {
  currencyCode: string;
  amount: string;
  count: number;
};

export type AdminDashboardResponse = {
  period: {
    kind: AdminDashboardPeriodKind;
    startOn: string;
    endOn: string;
    timezone: string;
  };
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
  };
  sales: {
    orderCount: number;
    totalByCurrency: DashboardCurrencyAmount[];
  };
  operationalCosts: {
    actualByCurrency: Array<{
      currencyCode: string;
      purchaseCount: number;
      subtotal: string;
      tax: string;
      total: string;
    }>;
  };
  dailyPayments: Array<{
    date: string;
    currencyCode: string;
    amount: string;
    paymentCount: number;
  }>;
  topOverdueCustomers: Array<{
    customerId: string;
    customerName: string;
    currencyCode: string;
    outstandingAmount: string;
    receivableCount: number;
    rank: number;
  }>;
};
