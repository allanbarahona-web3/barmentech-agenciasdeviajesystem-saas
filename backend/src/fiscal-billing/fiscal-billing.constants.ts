export const FISCAL_BILLING_SOURCE_TYPE = "SALES_ORDER";
export const ADDITIONAL_SERVICE_SALES_ORDER_SOURCE_TYPE =
  "ADDITIONAL_SERVICE_ORDER";
export const ELIGIBLE_SALES_ORDER_STATUS = "CREATED";

// Costa Rica electronic-document codes, scoped to the CR fiscal boundary.
export const CR_DOCUMENT_TYPES = {
  ELECTRONIC_INVOICE: "01",
  ELECTRONIC_TICKET: "04",
} as const;

export type CrDocumentTypeCode =
  (typeof CR_DOCUMENT_TYPES)[keyof typeof CR_DOCUMENT_TYPES];

export const CR_DOCUMENT_TYPE_CHOICES = [
  { code: CR_DOCUMENT_TYPES.ELECTRONIC_INVOICE, label: "Factura electrónica" },
  { code: CR_DOCUMENT_TYPES.ELECTRONIC_TICKET, label: "Tiquete electrónico" },
] as const;

export function billingCreationDeduplicationKey(salesOrderId: string): string {
  return `billing-document:primary:sales-order:${salesOrderId}`;
}

export function billingInternalNumber(salesOrderId: string): string {
  return `BD-SO-${salesOrderId}`;
}
