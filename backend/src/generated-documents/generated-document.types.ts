export const GENERATED_DOCUMENT_OWNER_TYPES = {
  ADDITIONAL_SERVICE_ORDER: "ADDITIONAL_SERVICE_ORDER",
  SALES_ORDER: "SALES_ORDER",
  CONTRACT: "CONTRACT",
  INVOICE: "INVOICE",
  RECEIPT: "RECEIPT",
  CREDIT_NOTE: "CREDIT_NOTE",
} as const;

export const GENERATED_DOCUMENT_TYPES = {
  COMMERCIAL_PROPOSAL: "COMMERCIAL_PROPOSAL",
  SALES_ORDER: "SALES_ORDER",
  CONTRACT: "CONTRACT",
  INVOICE: "INVOICE",
  RECEIPT: "RECEIPT",
  CREDIT_NOTE: "CREDIT_NOTE",
} as const;

export const GENERATED_DOCUMENT_VARIANTS = {
  ORIGINAL: "ORIGINAL",
  SIGNED: "SIGNED",
  CORRECTED: "CORRECTED",
} as const;

export interface GeneratedDocumentRecord {
  id: string;
  tenantId: string;
  ownerType: string;
  ownerId: string;
  documentType: string;
  variant: string;
  version: number;
  objectKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterGeneratedDocumentData {
  tenantId: string;
  ownerType: string;
  ownerId: string;
  documentType: string;
  variant: string;
  version?: number;
  objectKey: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface GeneratedDocumentOwnerReference {
  tenantId: string;
  ownerType: string;
  ownerId: string;
  documentType?: string;
  variant?: string;
}
