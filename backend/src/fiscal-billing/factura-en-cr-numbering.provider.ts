export const FACTURA_EN_CR_NUMBERING_PROVIDER = Symbol(
  "FACTURA_EN_CR_NUMBERING_PROVIDER",
);

export type ProviderNumberingInput = {
  legalId: string;
  branchCode: string;
  terminalCode: string;
};

export type ProviderNumberingVerificationInput = ProviderNumberingInput & {
  documentTypeCode: string;
};

export type ProviderNumberingConfiguration = {
  legalId: string;
  mode: "integrator" | "platform";
  branchCode: string;
  terminalCode: string;
  appliedToCertificates: number;
};

export type ProviderNumberingVerification = {
  legalId: string;
  documentTypeCode: string;
  branchCode: string;
  terminalCode: string;
  mode: "integrator" | "platform";
  currentNumber: number;
  nextNumber: number;
  nextConsecutivo20: string;
};

export interface FacturaEnCrNumberingProvider {
  configureIntegratorMode(
    input: ProviderNumberingInput,
  ): Promise<ProviderNumberingConfiguration>;
  verifyIntegratorMode(
    input: ProviderNumberingVerificationInput,
  ): Promise<ProviderNumberingVerification>;
}

export type FacturaEnCrNumberingProviderErrorCode =
  | "PROVIDER_NUMBERING_CONFIGURATION_MISSING"
  | "PROVIDER_NUMBERING_UNAVAILABLE"
  | "PROVIDER_NUMBERING_TIMEOUT"
  | "PROVIDER_NUMBERING_RATE_LIMITED"
  | "PROVIDER_NUMBERING_INVALID_RESPONSE"
  | "PROVIDER_NUMBERING_ISSUER_NOT_FOUND"
  | "PROVIDER_NUMBERING_CONFIGURATION_CONFLICT";

export class FacturaEnCrNumberingProviderError extends Error {
  constructor(readonly code: FacturaEnCrNumberingProviderErrorCode) {
    super(code);
    this.name = "FacturaEnCrNumberingProviderError";
  }
}
