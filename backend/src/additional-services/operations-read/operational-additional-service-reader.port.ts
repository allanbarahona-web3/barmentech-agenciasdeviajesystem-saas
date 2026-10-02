export const OPERATIONAL_ADDITIONAL_SERVICE_READER = Symbol("OPERATIONAL_ADDITIONAL_SERVICE_READER");

export type OperationalAdditionalServicePresentationField = { key: string; label: string; value: string; valueType: "TEXT" | "DATE" };
export type OperationalAdditionalServicePresentation = { title: string | null; subtitle: string | null; fields: OperationalAdditionalServicePresentationField[] };

export type OperationalAdditionalServiceContext = {
  sourceRef: { type: "ADDITIONAL_SERVICE_ORDER_LINE"; id: string; lineId: string; version: number | null };
  serviceCode: string;
  serviceName: string;
  commercialStatus: "APPROVED";
  soldValue: { amount: string; currency: string; scope: "EXACT_SERVICE_LINE" };
  presentation: OperationalAdditionalServicePresentation;
};

export interface OperationalAdditionalServiceReader {
  readForClients(request: { tenantId: string; travelPackageId: string; clientIds: readonly string[] }): Promise<Map<string, OperationalAdditionalServiceContext[]>>;
}
