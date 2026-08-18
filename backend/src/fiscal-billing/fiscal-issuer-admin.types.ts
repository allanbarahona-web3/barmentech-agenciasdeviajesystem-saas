export interface FiscalIssuerRecord {
  id: string;
  tenantId: string;
  displayName: string;
  isActive: boolean;
  legalName: string;
  identificationTypeCode: string;
  identificationNumber: string;
  commercialName: string | null;
  countryCode: string;
  email: string;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  provinceCode: string;
  cantonCode: string;
  districtCode: string;
  neighborhoodCode: string | null;
  otherAddressDetails: string;
  defaultCurrencyCode: string | null;
  establishmentCode: string | null;
  terminalCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type FiscalIssuerCreateInput = Pick<
  FiscalIssuerRecord,
  | "displayName"
  | "legalName"
  | "identificationTypeCode"
  | "identificationNumber"
  | "countryCode"
  | "email"
  | "provinceCode"
  | "cantonCode"
  | "districtCode"
  | "otherAddressDetails"
> &
  Partial<
    Pick<
      FiscalIssuerRecord,
      | "commercialName"
      | "phoneCountryCode"
      | "phoneNumber"
      | "neighborhoodCode"
      | "defaultCurrencyCode"
      | "establishmentCode"
      | "terminalCode"
    >
  >;

export type FiscalIssuerUpdateInput = Partial<FiscalIssuerCreateInput>;

export type FiscalIssuerStatusResult =
  | { kind: "NOT_FOUND" }
  | { kind: "INCOMPLETE"; missingFields: string[] }
  | { kind: "UPDATED"; issuer: FiscalIssuerRecord };
