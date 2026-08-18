import type {
  FiscalIssuerCreateInput,
  FiscalIssuerRecord,
  FiscalIssuerStatusResult,
  FiscalIssuerUpdateInput,
} from "./fiscal-issuer-admin.types";

export const FISCAL_ISSUER_ADMIN_REPOSITORY = Symbol(
  "FISCAL_ISSUER_ADMIN_REPOSITORY",
);

export interface FiscalIssuerAdminRepository {
  list(tenantId: string): Promise<FiscalIssuerRecord[]>;
  find(tenantId: string, issuerId: string): Promise<FiscalIssuerRecord | null>;
  create(
    tenantId: string,
    input: FiscalIssuerCreateInput,
  ): Promise<FiscalIssuerRecord>;
  update(
    tenantId: string,
    issuerId: string,
    input: FiscalIssuerUpdateInput,
  ): Promise<FiscalIssuerRecord | null>;
  setStatus(
    tenantId: string,
    issuerId: string,
    isActive: boolean,
  ): Promise<FiscalIssuerStatusResult>;
}
