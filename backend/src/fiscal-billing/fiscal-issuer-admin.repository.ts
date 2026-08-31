import type {
  FiscalIssuerCreateInput,
  FiscalIssuerRecord,
  FiscalIssuerStatusResult,
  FiscalIssuerUpdateInput,
  FiscalIssuerEconomicActivityRecord,
  EconomicActivityMutationResult,
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
  listEconomicActivities(tenantId: string, issuerId: string): Promise<FiscalIssuerEconomicActivityRecord[]>;
  findEconomicActivity(tenantId: string, issuerId: string, code: string): Promise<FiscalIssuerEconomicActivityRecord | null>;
  createEconomicActivity(tenantId: string, issuerId: string, code: string, description: string): Promise<FiscalIssuerEconomicActivityRecord>;
  selectPrimaryEconomicActivity(tenantId: string, issuerId: string, assignmentId: string): Promise<EconomicActivityMutationResult>;
  deleteEconomicActivity(tenantId: string, issuerId: string, assignmentId: string): Promise<EconomicActivityMutationResult>;
}
