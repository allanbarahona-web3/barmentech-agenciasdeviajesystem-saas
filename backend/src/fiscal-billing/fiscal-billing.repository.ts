import type {
  BillingConfigurationSnapshot,
  FiscalIssuerSnapshot,
  FiscalProfileSnapshot,
  SalesOrderSource,
} from "./fiscal-billing.types";

export const SALES_ORDER_FISCAL_BILLING_REPOSITORY = Symbol(
  "SALES_ORDER_FISCAL_BILLING_REPOSITORY",
);

export interface SalesOrderFiscalBillingRepository {
  listEligibleSalesOrders(
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<unknown>;
  findSalesOrder(
    tenantId: string,
    salesOrderId: string,
  ): Promise<SalesOrderSource | null>;
  findBillingConfiguration(
    tenantId: string,
  ): Promise<BillingConfigurationSnapshot | null>;
  findFiscalProfiles(
    tenantId: string,
    catalogIds: string[],
  ): Promise<FiscalProfileSnapshot[]>;
  findActiveIssuers(tenantId: string): Promise<FiscalIssuerSnapshot[]>;
  findIssuer(
    tenantId: string,
    issuerId: string,
  ): Promise<FiscalIssuerSnapshot | null>;
}
