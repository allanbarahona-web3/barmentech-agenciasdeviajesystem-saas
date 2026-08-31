export interface CabysProviderItem {
  code: string;
  description: string;
  referenceTaxPercentage: string;
}

export interface CabysCatalogProvider {
  search(query: string, top: number): Promise<CabysProviderItem[]>;
  findExact(code: string): Promise<CabysProviderItem | null>;
}

export const CABYS_CATALOG_PROVIDER = Symbol("CABYS_CATALOG_PROVIDER");

export type CabysProviderErrorCode =
  | "CABYS_PROVIDER_UNAVAILABLE"
  | "CABYS_PROVIDER_RATE_LIMITED"
  | "CABYS_PROVIDER_TIMEOUT"
  | "CABYS_PROVIDER_INVALID_RESPONSE";

export class CabysProviderError extends Error {
  constructor(readonly code: CabysProviderErrorCode) {
    super(code);
  }
}
